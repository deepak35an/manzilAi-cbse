"""add_test_number_to_quiz_sessions

Revision ID: 61b2703ee763
Revises: c89ff67626ff
Create Date: 2026-07-09 12:50:48.596584

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '61b2703ee763'
down_revision: Union[str, None] = 'c89ff67626ff'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Only add the test_number column — do NOT drop the notifications table
    op.add_column('quiz_sessions', sa.Column('test_number', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('quiz_sessions', 'test_number')
