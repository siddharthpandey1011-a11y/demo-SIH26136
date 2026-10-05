"""add password hash to users

Revision ID: 3cec5d8a6182
Revises: 11e265a8543a
Create Date: 2026-09-09 22:56:22.947733

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3cec5d8a6182'
down_revision: Union[str, Sequence[str], None] = '11e265a8543a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
