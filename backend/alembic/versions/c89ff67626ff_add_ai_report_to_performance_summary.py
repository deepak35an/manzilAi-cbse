"""add_ai_report_to_performance_summary

Revision ID: c89ff67626ff
Revises: a1b2c3d4e5f6
Create Date: 2026-07-02 14:30:15.504735

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'c89ff67626ff'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add cached AI report column; NULL = needs regeneration after next test
    op.add_column('performance_summary', sa.Column('ai_report', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('performance_summary', 'ai_report')
