"""Phase 3-4: notifications table, topic_proficiency on study plans, plan_id/week_number on sessions

Revision ID: a1b2c3d4e5f6
Revises: 4ba8e2fecb50
Create Date: 2026-06-25 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '4ba8e2fecb50'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. topic_proficiency on user_study_plans ─────────────────────────────
    op.add_column(
        'user_study_plans',
        sa.Column('topic_proficiency', postgresql.JSONB, nullable=True),
    )

    # ── 2. plan_id and week_number on quiz_sessions ───────────────────────────
    op.add_column(
        'quiz_sessions',
        sa.Column(
            'plan_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('study_plan_templates.id', ondelete='SET NULL'),
            nullable=True,
        ),
    )
    op.add_column(
        'quiz_sessions',
        sa.Column('week_number', sa.Integer, nullable=True),
    )
    op.create_index('ix_quiz_sessions_plan_id', 'quiz_sessions', ['plan_id'])

    # ── 3. notifications table ─────────────────────────────────────────────────
    op.create_table(
        'notifications',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('body', sa.Text, nullable=True),
        sa.Column('read', sa.Boolean, server_default='false', nullable=False),
        sa.Column('link', sa.String(512), nullable=True),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_notifications_user_id', 'notifications', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_notifications_user_id', table_name='notifications')
    op.drop_table('notifications')

    op.drop_index('ix_quiz_sessions_plan_id', table_name='quiz_sessions')
    op.drop_column('quiz_sessions', 'week_number')
    op.drop_column('quiz_sessions', 'plan_id')

    op.drop_column('user_study_plans', 'topic_proficiency')
