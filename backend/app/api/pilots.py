from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.models.pilot import Pilot
from app.models.application import Application
from app.models.startup import Startup
from app.models.user import User
from app.schemas.pilot import PilotCreate, PilotResponse
from app.auth import get_current_user, require_role

router = APIRouter(prefix="/pilots", tags=["Pilots"])

@router.post("", response_model=PilotResponse, status_code=status.HTTP_201_CREATED)
def create_pilot(
    pilot_in: PilotCreate,
    current_user: User = Depends(require_role("officer")),
    db: Session = Depends(get_db)
):
    """Officer only: create a pilot for a shortlisted application."""
    application = db.query(Application).filter(Application.id == pilot_in.application_id).first()
    if not application:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")

    if application.status != "shortlisted":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Pilots can only be created for shortlisted applications. Current status: '{application.status}'"
        )

    # Check if a pilot already exists for this application
    existing = db.query(Pilot).filter(Pilot.application_id == pilot_in.application_id).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Pilot already exists for this application."
        )

    pilot = Pilot(
        application_id=pilot_in.application_id,
        scope=pilot_in.scope,
        timeline_start=pilot_in.timeline_start,
        timeline_end=pilot_in.timeline_end,
        total_budget=pilot_in.total_budget,
        status="planned"
    )
    db.add(pilot)
    db.commit()
    db.refresh(pilot)
    return pilot

@router.get("", response_model=list[PilotResponse])
def list_pilots(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(Pilot).options(
        joinedload(Pilot.kpis),
        joinedload(Pilot.milestones),
        joinedload(Pilot.decision),
        joinedload(Pilot.application).joinedload(Application.startup),
        joinedload(Pilot.application).joinedload(Application.challenge)
    )

    if current_user.role == "startup":
        startup = db.query(Startup).filter(Startup.user_id == current_user.id).first()
        if not startup:
            return []
        query = query.join(Application).filter(Application.startup_id == startup.id)

    return query.order_by(Pilot.id.desc()).all()

@router.get("/{pilot_id}", response_model=PilotResponse)
def get_pilot(
    pilot_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    pilot = db.query(Pilot).options(
        joinedload(Pilot.kpis),
        joinedload(Pilot.milestones),
        joinedload(Pilot.decision),
        joinedload(Pilot.application).joinedload(Application.startup),
        joinedload(Pilot.application).joinedload(Application.challenge)
    ).filter(Pilot.id == pilot_id).first()

    if not pilot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pilot not found")

    if current_user.role == "startup":
        startup = db.query(Startup).filter(Startup.user_id == current_user.id).first()
        if not startup or pilot.application.startup_id != startup.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    return pilot

@router.patch("/{pilot_id}/budget", response_model=PilotResponse)
def update_pilot_budget(
    pilot_id: int,
    budget_in: __import__('app.schemas.pilot', fromlist=['PilotBudgetUpdate']).PilotBudgetUpdate,
    current_user: User = Depends(require_role('officer')),
    db: Session = Depends(get_db)
):
    pilot = db.query(Pilot).filter(Pilot.id == pilot_id).first()
    if not pilot:
        raise HTTPException(status_code=404, detail="Pilot not found")
    pilot.total_budget = budget_in.total_budget
    db.commit()
    db.refresh(pilot)
    return pilot
