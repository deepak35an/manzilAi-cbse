"""normalize_performance_summary_subjects

Revision ID: f8b90a12c3d4
Revises: e7f89102b3c4
Create Date: 2026-08-10 10:30:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'f8b90a12c3d4'
down_revision: Union[str, None] = 'e7f89102b3c4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Update any PerformanceSummary rows where subject='Gat' or 'CUET_GAT' to 'General Aptitude'
    op.execute("""
        UPDATE performance_summary
        SET subject = 'General Aptitude'
        WHERE LOWER(subject) IN ('gat', 'cuet_gat', 'cuet_general_aptitude');
    """)

    # 2. Deduplicate performance_summary rows per (user_id, plan_id, subject)
    op.execute("""
        DELETE FROM performance_summary
        WHERE id IN (
            SELECT id FROM (
                SELECT id,
                       ROW_NUMBER() OVER (
                           PARTITION BY user_id, COALESCE(plan_id, '00000000-0000-0000-0000-000000000000'::uuid), LOWER(subject)
                           ORDER BY updated_at DESC
                       ) as rnum
                FROM performance_summary
            ) t
            WHERE t.rnum > 1
        );
    """)

    # 3. Update JSON embedded "subject" field inside weak_topics JSONB column to match performance_summary.subject
    op.execute("""
        UPDATE performance_summary ps
        SET weak_topics = (
            SELECT jsonb_object_agg(
                key,
                jsonb_set(value, '{subject}', to_jsonb(ps.subject))
            )
            FROM jsonb_each(ps.weak_topics)
        )
        WHERE ps.weak_topics IS NOT NULL
          AND ps.weak_topics != '{}'::jsonb;
    """)

    # 4. Invalidate cached AI performance reports to force fresh generation with canonical subject names
    op.execute("""
        UPDATE performance_summary
        SET ai_report = NULL
        WHERE ai_report IS NOT NULL;
    """)


def downgrade() -> None:
    pass
