"""add encrypted_password to student_credentials

Revision ID: c1d2e3f4a5b6
Revises: b7c3e9f1a2d5
Create Date: 2026-09-03 06:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'c1d2e3f4a5b6'
down_revision: Union[str, None] = 'b7c3e9f1a2d5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('student_credentials', sa.Column('encrypted_password', sa.String(length=512), nullable=True))


def downgrade() -> None:
    op.drop_column('student_credentials', 'encrypted_password')
