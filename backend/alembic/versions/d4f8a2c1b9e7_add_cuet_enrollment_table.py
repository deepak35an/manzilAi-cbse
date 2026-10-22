"""add_cuet_enrollment_table

Revision ID: d4f8a2c1b9e7
Revises: 61b2703ee763
Create Date: 2026-07-25 06:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'd4f8a2c1b9e7'
down_revision: Union[str, None] = '61b2703ee763'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'cuet_enrollments',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('template_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('duration_months', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['template_id'], ['study_plan_templates.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'template_id', name='uq_cuet_enrollment_user_template'),
    )
    op.create_index(
        'ix_cuet_enrollments_user_duration',
        'cuet_enrollments',
        ['user_id', 'duration_months'],
    )


def downgrade() -> None:
    op.drop_index('ix_cuet_enrollments_user_duration', table_name='cuet_enrollments')
    op.drop_table('cuet_enrollments')
