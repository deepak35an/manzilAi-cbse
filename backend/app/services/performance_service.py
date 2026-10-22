"""
Performance tracking service.

After each quiz session completes, `update_topic_performance` is called to
aggregate the per-topic scores from that session into the student's
PerformanceSummary rows (one row per (user_id, plan_id, subject)).

The `weak_topics` JSONB column stores a comprehensive topic stats map:
  {
    "topic_name": { "avg_score": 7.5, "attempts": 3, "subject": "Chemistry" }
  }

`get_strengths_weaknesses` reads those rows and derives the top-N strengths
(highest avg_score) and top-N weaknesses (lowest avg_score) for the student,
optionally scoped to a specific list of plan_ids.
"""
import uuid
from datetime import datetime
from typing import List, Optional
from collections import defaultdict

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.quiz import PerformanceSummary
from app.utils.logging import logger


MIN_ATTEMPTS = 1  # minimum question attempts before a topic appears in results

# All subject tags in question banks that map to "General Aptitude"
# (CUET_GAT question banks use varied subject labels; all belong to one subject)
GAT_SUBJECT_ALIASES: frozenset[str] = frozenset({
    "gat", "cuet_gat", "general aptitude", "general_aptitude",
    "general knowledge", "general studies", "general",
})


def exam_key_to_canonical_subject(exam_key: str) -> str:
    """
    Derive a canonical display subject name from a StudyPlanTemplate exam key.
    Examples:
        CUET_GAT       -> "General Aptitude"
        CUET_CHEMISTRY -> "Chemistry"
        CUET_ENGLISH   -> "English"
        CUET_BIOLOGY   -> "Biology"
        GATE           -> "GATE"
    """
    if not exam_key:
        return "General"
    clean = exam_key.upper().strip()
    if clean in ("CUET_GAT", "GAT", "CUET_GENERAL_APTITUDE"):
        return "General Aptitude"
    if clean.startswith("CUET_"):
        return clean.replace("CUET_", "").replace("_", " ").title()
    return exam_key


async def update_topic_performance(
    user_id: uuid.UUID,
    responses: list,           # list of UserResponse ORM objects
    question_map: dict,        # question_id -> question dict (from Redis state)
    db: AsyncSession,
    session_theta: float = 0.0,
    plan_id: Optional[uuid.UUID] = None,        # session's plan scope (fallback)
    subject_to_plan_id: Optional[dict[str, uuid.UUID]] = None,  # for combined CUET tests
    canonical_subject: Optional[str] = None,    # HARD OVERRIDE for single-subject tests
    fallback_canonical_subject: Optional[str] = None,  # kept for backward-compat
) -> None:
    """
    Compute per-topic stats from the just-completed session and upsert them
    into PerformanceSummary for this user, scoped by plan_id.

    Subject resolution rules (in priority order):
      1. If canonical_subject is set (single-subject test) → ALL questions stored
         under that canonical subject regardless of their raw 'subject' tag.
         This is the critical override: GAT questions tagged 'Chemistry' in the
         question bank are still stored as 'General Aptitude' when taken as a GAT test.
      2. For combined CUET tests (subject_to_plan_id provided) → route each question
         to the enrolled plan that matches its subject. Unknown subjects fall back to
         the General Aptitude plan if one is enrolled.
      3. Raw subject from question JSON, normalised via GAT_SUBJECT_ALIASES.
    """
    if not responses:
        return

    # For combined tests, identify the GAT plan_id as the fallback for unrecognised subjects
    gat_fallback_plan_id: Optional[uuid.UUID] = None
    if subject_to_plan_id:
        gat_fallback_plan_id = subject_to_plan_id.get("general aptitude")

    # --- 1. Group scores by (subject, topic) from this session ---
    session_topic_stats: dict[tuple, list[float]] = defaultdict(list)

    for r in responses:
        q_info = question_map.get(str(r.question_id), {})

        if canonical_subject:
            # ── Single-subject test: HARD OVERRIDE ────────────────────────────
            # All questions belong to this plan's canonical subject regardless of
            # what subject tag is embedded in the question JSON.
            subject = canonical_subject
        else:
            # ── Combined test OR legacy: normalise from raw question tag ───────
            raw_subj = (q_info.get("subject") or "").strip()
            raw_subj_lower = raw_subj.lower()
            if raw_subj_lower in GAT_SUBJECT_ALIASES:
                subject = "General Aptitude"
            elif raw_subj:
                subject = raw_subj.title()
            else:
                subject = fallback_canonical_subject or "General Aptitude"

        topic = (q_info.get("topic") or "General").strip()
        score = float(r.score)
        session_topic_stats[(subject, topic)].append(score)

    if not session_topic_stats:
        return

    # --- 2. Compute session-level averages per (subject, topic) ---
    subject_buckets: dict[str, dict[str, dict]] = defaultdict(dict)
    for (subject, topic), scores in session_topic_stats.items():
        session_avg = sum(scores) / len(scores)
        session_count = len(scores)
        subject_buckets[subject][topic] = {
            "session_avg": session_avg,
            "session_count": session_count,
        }

    # --- 3. Upsert into PerformanceSummary (scoped by resolved plan_id) ---
    for subject, topic_data in subject_buckets.items():
        # Resolve target plan_id for this specific subject if a mapping exists
        target_plan_id = plan_id
        if subject_to_plan_id:
            s_clean = subject.strip().lower()
            if s_clean in subject_to_plan_id:
                target_plan_id = subject_to_plan_id[s_clean]
            else:
                # Partial match (e.g. "operating system" matching "operating systems")
                for k, pid in subject_to_plan_id.items():
                    if k in s_clean or s_clean in k:
                        target_plan_id = pid
                        break
                else:
                    # Subject not enrolled — route to General Aptitude plan if available
                    # (handles GAT-bank questions tagged with random subjects like 'History')
                    if gat_fallback_plan_id:
                        subject = "General Aptitude"
                        target_plan_id = gat_fallback_plan_id

        # Lookup scoped by (user_id, target_plan_id, subject)
        stmt = select(PerformanceSummary).where(
            PerformanceSummary.user_id == user_id,
            PerformanceSummary.subject == subject,
        )
        if target_plan_id is not None:
            stmt = stmt.where(PerformanceSummary.plan_id == target_plan_id)
        else:
            stmt = stmt.where(PerformanceSummary.plan_id.is_(None))

        result = await db.execute(stmt)
        perf = result.scalar_one_or_none()

        if perf is None:
            existing_topic_stats: dict = {}
            perf = PerformanceSummary(
                id=uuid.uuid4(),
                user_id=user_id,
                plan_id=target_plan_id,
                subject=subject,
                avg_theta=0.0,
                total_attempts=0,
                weak_topics={},
            )
            db.add(perf)
        else:
            existing_topic_stats = perf.weak_topics or {}

        # Merge session stats using running average
        updated_stats = dict(existing_topic_stats)
        for topic, sdata in topic_data.items():
            if topic in updated_stats:
                existing = updated_stats[topic]
                old_avg = float(existing.get("avg_score", 0.0))
                old_n = int(existing.get("attempts", 0))
                new_n = old_n + sdata["session_count"]
                new_avg = (old_avg * old_n + sdata["session_avg"] * sdata["session_count"]) / new_n
                updated_stats[topic] = {
                    "avg_score": round(new_avg, 4),
                    "attempts": new_n,
                    "subject": subject,
                    "last_updated": datetime.utcnow().isoformat(),
                }
            else:
                updated_stats[topic] = {
                    "avg_score": round(sdata["session_avg"], 4),
                    "attempts": sdata["session_count"],
                    "subject": subject,
                    "last_updated": datetime.utcnow().isoformat(),
                }

        from sqlalchemy.orm.attributes import flag_modified
        perf.weak_topics = updated_stats
        flag_modified(perf, "weak_topics")

        added_attempts = sum(d["session_count"] for d in topic_data.values())
        old_total = perf.total_attempts or 0
        new_total = old_total + added_attempts
        perf.total_attempts = new_total

        if session_theta != 0.0 and new_total > 0:
            old_theta = float(perf.avg_theta or 0.0)
            perf.avg_theta = round(
                (old_theta * old_total + session_theta * added_attempts) / new_total, 4
            )

        perf.updated_at = datetime.utcnow()

    # Invalidate cached AI report strictly for summary records belonging to this plan scope
    # so taking a test in one plan does NOT clear the AI report of another plan.
    clear_ai_stmt = select(PerformanceSummary).where(
        PerformanceSummary.user_id == user_id,
        PerformanceSummary.ai_report.isnot(None),
    )
    all_plan_ids = set()
    if plan_id:
        all_plan_ids.add(plan_id)
    if subject_to_plan_id:
        all_plan_ids.update(subject_to_plan_id.values())

    if all_plan_ids:
        clear_ai_stmt = clear_ai_stmt.where(PerformanceSummary.plan_id.in_(list(all_plan_ids)))

    clear_res = await db.execute(clear_ai_stmt)
    for s_row in clear_res.scalars().all():
        s_row.ai_report = None

    logger.info(
        "topic_performance_updated",
        user_id=str(user_id),
        plan_id=str(plan_id) if plan_id else None,
        subjects=list(subject_buckets.keys()),
    )


async def get_strengths_weaknesses(
    user_id: uuid.UUID,
    db: AsyncSession,
    min_attempts: int = MIN_ATTEMPTS,
    top_n: int = 5,
    plan_ids: Optional[List[uuid.UUID]] = None,
    subject_filter: Optional[str] = None,
) -> dict:
    """
    Return the top-N strongest and weakest topics for a student.

    When plan_ids is provided, only PerformanceSummary rows matching those
    plan_ids are considered (exact UUID match).
    When subject_filter is provided, rows are additionally matched against that subject name.
    """
    stmt = select(PerformanceSummary).where(PerformanceSummary.user_id == user_id)
    if plan_ids:
        stmt = stmt.where(PerformanceSummary.plan_id.in_(plan_ids))

    result = await db.execute(stmt)
    summaries = result.scalars().all()

    all_topics: list[dict] = []
    for summary in summaries:
        subj_name = summary.subject or "General"
        if subject_filter:
            sf_clean = subject_filter.strip().lower()
            sn_clean = subj_name.strip().lower()
            if sf_clean not in sn_clean and sn_clean not in sf_clean:
                continue

        stats = summary.weak_topics or {}
        for topic_name, data in stats.items():
            attempts = int(data.get("attempts", 0))
            if attempts < min_attempts:
                continue
            all_topics.append({
                "topic": topic_name,
                "subject": summary.subject,
                "avg_score": round(float(data.get("avg_score", 0.0)), 2),
                "attempts": attempts,
            })

    if not all_topics:
        return {"strengths": [], "weaknesses": []}

    sorted_desc = sorted(all_topics, key=lambda x: x["avg_score"], reverse=True)

    if len(all_topics) == 1:
        if sorted_desc[0]["avg_score"] >= 5.0:
            strengths = sorted_desc
            weaknesses = []
        else:
            strengths = []
            weaknesses = sorted_desc
    elif len(all_topics) <= top_n:
        half = max(1, len(all_topics) // 2)
        strengths = sorted_desc[:half]
        weaknesses = sorted_desc[half:]
    else:
        strengths = sorted_desc[:top_n]
        strength_topics = {s["topic"] for s in strengths}
        sorted_asc = sorted(all_topics, key=lambda x: x["avg_score"])
        weaknesses = [w for w in sorted_asc if w["topic"] not in strength_topics][:top_n]

    return {
        "strengths": strengths,
        "weaknesses": weaknesses,
    }
