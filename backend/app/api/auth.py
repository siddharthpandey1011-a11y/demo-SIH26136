"""
Authentication endpoints:
  POST /api/auth/register  — create user + role profile in one transaction
  POST /api/auth/login     — email/password → JWT
  GET  /api/auth/me        — JWT-protected own profile
  GET  /api/auth/me/startup — JWT-protected own startup profile
"""
from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from sqlalchemy.orm import Session
import secrets
import hashlib
from datetime import datetime, timezone, timedelta
from app.models.refresh_token import RefreshToken

from app.auth import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)
from app.config import settings
from app.database import get_db
from app.models.startup import Startup
from app.models.user import User
from app.schemas.startup import StartupResponse
from app.schemas.user import TokenResponse, UserLogin, UserRegister, UserResponse

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

# ── Role mapping: frontend → DB ───────────────────────────────────────────────
_ROLE_MAP = {
    "startup": "startup",
    "gov_officer": "officer",
}


# ── POST /api/auth/register ───────────────────────────────────────────────────
@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: UserRegister, db: Session = Depends(get_db)):
    """
    Register a new user.

    - startup    → also requires startup_profile (sector, dpiit_status, profile_text)
                   Automatically creates a linked Startup row.
    - gov_officer → requires email domain validation against GOV_EMAIL_DOMAINS
                   unless ALLOW_OPEN_GOV_REGISTRATION is true.
    """
    # Normalize email
    email = payload.email.strip().lower()
    name = payload.name.strip()

    # Role validation
    if payload.role not in _ROLE_MAP:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid role. Only 'startup' and 'gov_officer' are allowed for public registration.",
        )

    db_role = _ROLE_MAP[payload.role]

    # Government officer email domain validation
    if db_role == "officer" and not settings.ALLOW_OPEN_GOV_REGISTRATION:
        allowed_domains = [d.strip() for d in settings.GOV_EMAIL_DOMAINS.split(",")]
        email_domain = email.split("@")[-1] if "@" in email else ""
        if email_domain not in allowed_domains:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Government officer registration requires an email from an approved domain: {', '.join(allowed_domains)}",
            )

    # Duplicate email guard (Generic message per Prompt 2)
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Registration failed. If you already have an account, please log in.",
        )

    # Validate role-specific required fields
    if db_role == "startup" and not payload.startup_profile:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="startup_profile (startup_name, sector, dpiit_status, profile_text) is required for startup registration.",
        )

    # Password validation
    if len(payload.password) < 8:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Password must be at least 8 characters.",
        )
    if len(payload.password) > 72:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Password must not exceed 72 characters.",
        )

    # Create user
    from datetime import datetime, timezone
    user = User(
        name=name,
        email=email,
        role=db_role,
        hashed_password=hash_password(payload.password),
        created_at=datetime.now(timezone.utc),
    )
    db.add(user)
    db.flush()  # get user.id before committing

    # Create startup profile row if role == startup
    startup_obj = None
    if db_role == "startup" and payload.startup_profile:
        sp = payload.startup_profile
        startup_obj = Startup(
            user_id=user.id,
            name=sp.startup_name,     # Use the provided startup name
            startup_name=sp.startup_name,
            sector=sp.sector,
            dpiit_status=sp.dpiit_status,
            profile_text=sp.profile_text,
            msme_reg_no=sp.msme_reg_no,
            women_led=sp.women_led,
            make_in_india_class=sp.make_in_india_class,
        )
        db.add(startup_obj)

    db.commit()
    db.refresh(user)
    if startup_obj:
        db.refresh(startup_obj)

    token = create_access_token({"sub": str(user.id)})
    resp = TokenResponse(
        access_token=token,
        user=UserResponse.model_validate(user),
        startup=StartupResponse.model_validate(startup_obj).model_dump() if startup_obj else None,
    )
    return resp


# ── POST /api/auth/login ──────────────────────────────────────────────────────
from fastapi import Response
import secrets
import hashlib
from datetime import datetime, timezone, timedelta
from app.models.refresh_token import RefreshToken

# Simple in-memory rate limiter (note: not suitable for multi-worker deployments)
_login_attempts = {}

def check_rate_limit(identifier: str, max_attempts: int = 5, window_minutes: int = 15) -> bool:
    """Simple in-memory rate limiting for login attempts."""
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    window_start = now - timedelta(minutes=window_minutes)

    if identifier not in _login_attempts:
        _login_attempts[identifier] = []

    # Clean old attempts
    _login_attempts[identifier] = [
        attempt for attempt in _login_attempts[identifier]
        if attempt > window_start
    ]

    if len(_login_attempts[identifier]) >= max_attempts:
        return False

    _login_attempts[identifier].append(now)
    return True

@router.post("/login", response_model=TokenResponse)
def login(payload: UserLogin, response: Response, request: Request, db: Session = Depends(get_db)):
    """
    Authenticate with email + password.
    Returns JWT access token.
    """
    # Normalize email
    email = payload.email.strip().lower()

    # Rate limiting by IP + email combination
    # Note: In production, use Redis or similar for distributed rate limiting
    client_host = request.client.host if request.client else "unknown"
    client_identifier = f"{email}:{client_host}"
    if not check_rate_limit(client_identifier):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Please try again later.",
        )

    user = db.query(User).filter(User.email == email).first()

    _INVALID = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid email or password.",
    )

    # Timing attack prevention: always run hash check if user exists
    if user and user.hashed_password:
        password_valid = verify_password(payload.password, user.hashed_password)
    else:
        # Run dummy hash check to prevent timing attacks
        verify_password(payload.password, hash_password("dummy"))
        password_valid = False

    if not password_valid:
        raise _INVALID

    if user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account is pending, disabled, or unavailable for login.",
        )

    # Access Token
    token = create_access_token({"sub": str(user.id)})

    # Refresh Token
    refresh_token_plain = secrets.token_urlsafe(32)
    refresh_token_hash = hashlib.sha256(refresh_token_plain.encode()).hexdigest()

    now = datetime.now(timezone.utc)
    new_rt = RefreshToken(
        user_id=user.id,
        token_hash=refresh_token_hash,
        expires_at=now + timedelta(days=7),
        created_at=now
    )
    db.add(new_rt)

    # Update last login
    user.last_login_at = now
    db.commit()

    # Set Cookie
    response.set_cookie(
        key="refresh_token",
        value=refresh_token_plain,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=7 * 24 * 60 * 60
    )

    startup_obj = None
    if user.role == "startup":
        startup_obj = db.query(Startup).filter(Startup.user_id == user.id).first()

    return TokenResponse(
        access_token=token,
        user=UserResponse.model_validate(user),
        startup=StartupResponse.model_validate(startup_obj).model_dump() if startup_obj else None,
    )


# ── GET /api/auth/me ──────────────────────────────────────────────────────────
@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """
    Return the JWT-authenticated user's own profile.
    The JWT sub claim encodes the user_id — no ID in the URL.
    Prevents IDOR: a user can never see another user's profile
    by manipulating a URL parameter.
    """
    return current_user


# ── GET /api/auth/me/startup ──────────────────────────────────────────────────
@router.get("/me/startup", response_model=StartupResponse)
def get_my_startup_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Return the JWT-authenticated startup's own Startup record.
    Only accessible if the authenticated user has role=startup.
    """
    if current_user.role != "startup":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only startup accounts have a startup profile.",
        )
    startup = db.query(Startup).filter(Startup.user_id == current_user.id).first()
    if not startup:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Startup profile not found. Please complete your profile.",
        )
    return startup

# ── POST /api/auth/refresh ────────────────────────────────────────────────────
from fastapi import Request, Response
from app.models.refresh_token import RefreshToken

@router.post("/refresh")
def refresh_token(request: Request, response: Response, db: Session = Depends(get_db)):
    """
    Refresh the access token using the HTTPOnly refresh_token cookie.
    Rotates the refresh token on success.
    """
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise HTTPException(status_code=401, detail="No refresh token found.")
    
    import hashlib
    token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
    
    rt = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()
    
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    
    if not rt or rt.revoked or rt.expires_at < now:
        if rt:
            rt.revoked = True
            db.commit()
        response.delete_cookie("refresh_token")
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token.")
    
    user = db.query(User).filter(User.id == rt.user_id).first()
    if not user or user.status != "active":
        raise HTTPException(status_code=401, detail="User account is inactive.")
    
    # Rotate refresh token
    rt.revoked = True
    
    import secrets
    from datetime import timedelta
    new_token = secrets.token_urlsafe(32)
    new_token_hash = hashlib.sha256(new_token.encode()).hexdigest()
    
    new_rt = RefreshToken(
        user_id=user.id,
        token_hash=new_token_hash,
        expires_at=now + timedelta(days=7),
        created_at=now
    )
    db.add(new_rt)
    db.commit()
    
    response.set_cookie(
        key="refresh_token",
        value=new_token,
        httponly=True,
        secure=True, 
        samesite="lax",
        max_age=7 * 24 * 60 * 60
    )
    
    new_access_token = create_access_token({"sub": str(user.id)})
    return {"access_token": new_access_token, "token_type": "bearer"}


# ── POST /api/auth/logout ─────────────────────────────────────────────────────
@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    """
    Revoke the refresh token and clear the cookie.
    """
    refresh_token = request.cookies.get("refresh_token")
    if refresh_token:
        import hashlib
        token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
        rt = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()
        if rt:
            rt.revoked = True
            db.commit()
            
    response.delete_cookie("refresh_token")
    return {"detail": "Successfully logged out."}
