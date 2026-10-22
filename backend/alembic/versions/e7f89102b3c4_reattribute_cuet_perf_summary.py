"""reattribute_cuet_perf_summary

Revision ID: e7f89102b3c4
Revises: f5e843745c1d
Create Date: 2026-07-31 16:28:00.000000

"""
from typing import Sequence, Union
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'e7f89102b3c4'
down_revision: Union[str, None] = 'f5e843745c1d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Deduplicate performance_summary rows per (user_id, LOWER(subject)), keeping the row with plan_id set (or newest updated_at)
    op.execute("""
        DELETE FROM performance_summary
        WHERE id IN (
            SELECT id FROM (
                SELECT id,
                       ROW_NUMBER() OVER (
                           PARTITION BY user_id, LOWER(subject)
                           ORDER BY (plan_id IS NOT NULL) DESC, updated_at DESC
                       ) as rnum
                FROM performance_summary
            ) t
            WHERE t.rnum > 1
        );
    """)

    # 2. Re-attribute CUET performance_summary rows to the matching subject's template_id
    op.execute("""
        UPDATE performance_summary ps
        SET plan_id = ce.template_id
        FROM cuet_enrollments ce
        JOIN study_plan_templates spt ON ce.template_id = spt.id
        WHERE ps.user_id = ce.user_id
          AND (
            LOWER(ps.subject) = LOWER(REPLACE(REPLACE(spt.exam, 'CUET_', ''), '_', ' '))
            OR LOWER(REPLACE(spt.exam, 'CUET_', '')) LIKE '%' || LOWER(ps.subject) || '%'
            OR LOWER(ps.subject) LIKE '%' || LOWER(REPLACE(spt.exam, 'CUET_', '')) || '%'
          )
          AND (ps.plan_id IS NULL OR ps.plan_id != ce.template_id);
    """)


def downgrade() -> None:
    pass
