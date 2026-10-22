"""fix_sw_topic_attribution_and_add_unique_constraint

Revision ID: a9c1d2e3f4b5
Revises: f8b90a12c3d4
Create Date: 2026-08-10 10:50:00.000000

This migration resolves three confirmed bugs in the S&W topic breakdown:

  BUG 1 — Single-subject tests stored questions under wrong subject
  ---------------------------------------------------------------
  When a student took a CUET_GAT weekly test, questions from the GAT
  question bank that happened to have subject='Chemistry' or subject='Biology'
  were stored in PerformanceSummary as subject='Chemistry', plan_id=CUET_GAT_uuid
  rather than subject='General Aptitude', plan_id=CUET_GAT_uuid.
  This caused those topics to appear TWICE in the topic breakdown:
    - once correctly (plan=CUET_CHEMISTRY, subject='Chemistry')
    - once incorrectly (plan=CUET_GAT, subject='Chemistry')

  FIX: Delete all rows where:
    plan.exam starts with CUET_ AND
    subject != canonical_subject_for_that_exam

  BUG 2 — 'General Knowledge' treated as a separate subject
  ----------------------------------------------------------
  Some questions are tagged subject='General Knowledge' instead of
  'General Aptitude'. This created a separate PerformanceSummary row.

  FIX: Merge 'General Knowledge' rows into 'General Aptitude' rows for
  the same (user_id, plan_id), then delete the stale 'General Knowledge' row.

  BUG 3 — No uniqueness guarantee
  ---------------------------------
  No UNIQUE constraint on (user_id, plan_id, subject) existed, allowing
  the above data corruption to accumulate silently.

  FIX: Add UNIQUE constraint.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'a9c1d2e3f4b5'
down_revision: Union[str, None] = 'f8b90a12c3d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Step 1: Delete misattributed rows ────────────────────────────────────
    # A CUET subject plan (e.g. CUET_GAT) must only have PerformanceSummary rows
    # whose subject matches the canonical subject for that plan.
    # Canonical mapping: CUET_GAT → 'General Aptitude'; CUET_CHEMISTRY → 'Chemistry', etc.
    #
    # Delete rows where subject does NOT match expected canonical subject for the plan.
    op.execute("""
        DELETE FROM performance_summary ps
        USING study_plan_templates spt
        WHERE ps.plan_id = spt.id
          AND spt.exam LIKE 'CUET_%'
          AND LOWER(ps.subject) != LOWER(
              CASE
                WHEN UPPER(spt.exam) IN ('CUET_GAT', 'CUET_GENERAL_APTITUDE')
                  THEN 'General Aptitude'
                ELSE REPLACE(REPLACE(UPPER(spt.exam), 'CUET_', ''), '_', ' ')
              END
          );
    """)

    # ── Step 2: Merge 'General Knowledge' rows into 'General Aptitude' ───────
    # For each row with subject='General Knowledge', merge its weak_topics JSON
    # into the corresponding 'General Aptitude' row (same user_id, same plan_id).
    # If no General Aptitude row exists, simply rename the subject.
    op.execute("""
        UPDATE performance_summary AS gk
        SET weak_topics = (
            SELECT COALESCE(ga.weak_topics, '{}'::jsonb) || gk.weak_topics
            FROM performance_summary ga
            WHERE ga.user_id  = gk.user_id
              AND ga.subject   = 'General Aptitude'
              AND (
                (ga.plan_id IS NULL AND gk.plan_id IS NULL)
                OR ga.plan_id = gk.plan_id
              )
        ),
        subject = 'General Aptitude'
        WHERE gk.subject IN ('General Knowledge', 'General Studies', 'General');
    """)

    # Remove now-duplicate General Knowledge rows (merged ones and orphan ones)
    op.execute("""
        DELETE FROM performance_summary
        WHERE id IN (
            SELECT id FROM (
                SELECT id,
                       ROW_NUMBER() OVER (
                           PARTITION BY user_id,
                                        COALESCE(plan_id, '00000000-0000-0000-0000-000000000000'::uuid),
                                        LOWER(subject)
                           ORDER BY total_attempts DESC, updated_at DESC
                       ) AS rn
                FROM performance_summary
                WHERE LOWER(subject) = 'general aptitude'
            ) sub
            WHERE rn > 1
        );
    """)

    # ── Step 3: Remove any remaining NULL plan_id CUET rows ──────────────────
    # Old rows from before plan_id was tracked — these are unattributable and
    # will be replaced by fresh, correctly-attributed data going forward.
    op.execute("""
        DELETE FROM performance_summary
        WHERE plan_id IS NULL
          AND subject IN (
              'General Knowledge', 'General Studies',
              'Political Science', 'History', 'Geography',
              'Economics', 'Accountancy', 'Environmental Science'
          );
    """)

    # ── Step 4: Add UNIQUE constraint on (user_id, plan_id, subject) ─────────
    # First deduplicate any remaining duplicates to prevent constraint failure.
    op.execute("""
        DELETE FROM performance_summary
        WHERE id IN (
            SELECT id FROM (
                SELECT id,
                       ROW_NUMBER() OVER (
                           PARTITION BY user_id,
                                        COALESCE(plan_id, '00000000-0000-0000-0000-000000000000'::uuid),
                                        LOWER(subject)
                           ORDER BY total_attempts DESC, updated_at DESC
                       ) AS rn
                FROM performance_summary
            ) sub
            WHERE rn > 1
        );
    """)

    # Add the constraint (NULL plan_ids use a partial index trick via COALESCE in partition above;
    # we use a real UNIQUE INDEX that handles NULLs correctly via COALESCE in the index expression)
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_perf_summary_user_plan_subject
        ON performance_summary (
            user_id,
            COALESCE(plan_id, '00000000-0000-0000-0000-000000000000'::uuid),
            LOWER(subject)
        );
    """)

    # Invalidate AI report cache — subjects changed, reports need regeneration
    op.execute("""
        UPDATE performance_summary SET ai_report = NULL WHERE ai_report IS NOT NULL;
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_perf_summary_user_plan_subject;")
