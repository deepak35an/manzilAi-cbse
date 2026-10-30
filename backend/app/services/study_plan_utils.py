"""Helpers for week-wise and topic-wise study plan JSON."""

from __future__ import annotations

import json
from typing import Any, Optional


TOPIC_WISE_PLAN_TYPE = "TOPIC_WISE_TESTS"
TOPIC_WISE_TEST_SIZE = 20  # Fixed question count per topic test

# Friendly UI / org allocation labels → canonical StudyPlanTemplate.exam keys
EXAM_ALIAS: dict[str, str] = {
    "GATE": "GATE_CSE_PYQ",
    "GATE CSE": "GATE_CSE_PYQ",
    "GATE_CSE": "GATE_CSE_PYQ",
    "CBSE": "CBSE_10_SOCIAL_SCIENCE",
    "CBSE Class 10": "CBSE_10_SOCIAL_SCIENCE",
    "Class 10 CBSE": "CBSE_10_SOCIAL_SCIENCE",
    "CBSE_10": "CBSE_10_SOCIAL_SCIENCE",
    "CBSE 10": "CBSE_10_SOCIAL_SCIENCE",
}

# ContentRegistry.subfolder values that hold questions for a plan exam key
CONTENT_SUBFOLDER_ALIASES: dict[str, list[str]] = {
    "CBSE_10_SOCIAL_SCIENCE": ["CBSE_10_SOCIAL_SCIENCE", "CBSE_10"],
    "GATE_CSE_PYQ": ["GATE_CSE_PYQ"],
}


def resolve_exam_key(exam: str) -> str:
    """Map a friendly exam label to the canonical template/content key."""
    return EXAM_ALIAS.get(exam, exam)


def content_subfolders_for_exam(exam_key: str) -> list[str]:
    """Subfolders to search when loading PYQ questions for a plan exam."""
    aliases = CONTENT_SUBFOLDER_ALIASES.get(exam_key)
    if aliases:
        return list(aliases)
    # CBSE_10_* subjects fall back to CBSE_10 bank
    if exam_key.startswith("CBSE_10_"):
        return [exam_key, "CBSE_10"]
    if exam_key.startswith("CBSE_12_"):
        return [exam_key, "CBSE_12"]
    return [exam_key]


def exam_allocation_matches(allocated: list[str], exam_key: str) -> bool:
    """True if the student may use exam_key given org allocated_exams."""
    if not allocated:
        return True
    allowed: set[str] = set()
    for item in allocated:
        allowed.add(item)
        allowed.add(resolve_exam_key(item))
        # reverse: if allocated canonical, also allow common labels
        for label, canonical in EXAM_ALIAS.items():
            if canonical == item or item == canonical:
                allowed.add(label)
                allowed.add(canonical)
    # Always allow the resolved form of the requested exam
    allowed.add(exam_key)
    allowed.add(resolve_exam_key(exam_key))
    if "CUET" in allowed:
        allowed.update({"CUET_PYQ", "CUET"})
    return exam_key in allowed or resolve_exam_key(exam_key) in allowed


def parse_plan_json(raw: str | None) -> dict:
    """Parse a StudyPlanTemplate.plan string (plain JSON or fenced Markdown)."""
    if not raw:
        return {}
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1]
        if "```" in text:
            text = text.rsplit("```", 1)[0]
        text = text.strip()
        if text.lower().startswith("json"):
            text = text[4:].strip()
    try:
        data = json.loads(text)
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, TypeError):
        return {}


def is_topic_wise_plan(plan_obj: dict | None = None, raw: str | None = None) -> bool:
    """True when the plan uses TOPIC_WISE_TESTS instead of a week roadmap."""
    obj = plan_obj if plan_obj is not None else parse_plan_json(raw)
    if not obj:
        return False
    if obj.get("plan_type") == TOPIC_WISE_PLAN_TYPE:
        return True
    # Heuristic: topic list present and no roadmap weeks
    topics = obj.get("topics")
    roadmap = obj.get("roadmap")
    return isinstance(topics, list) and topics and not roadmap


def get_topic_by_sequence(plan_obj: dict, sequence: int) -> Optional[dict]:
    """Return the topic entry whose sequence matches (1-based)."""
    topics = plan_obj.get("topics") or []
    for item in topics:
        if not isinstance(item, dict):
            continue
        if item.get("sequence") == sequence:
            return item
    # Fallback: treat list order as sequence
    if 1 <= sequence <= len(topics) and isinstance(topics[sequence - 1], dict):
        return topics[sequence - 1]
    return None


def topic_to_match_target(topic: dict) -> dict:
    """Build a match_questions_for_targets target from a topic-wise plan entry."""
    subtopics = topic.get("subtopics") or []
    if isinstance(subtopics, list) and subtopics and isinstance(subtopics[0], dict):
        names = [s.get("name") or s.get("subtopic") or "" for s in subtopics]
    else:
        names = [s for s in subtopics if isinstance(s, str)]
    return {
        "subject": (topic.get("subject") or "").lower().strip(),
        "topic": (topic.get("topic") or "").lower().strip(),
        "subtopics": [s.lower().strip() for s in names if s],
    }


def extract_week_targets(plan_obj: dict, week_number: int) -> list[dict]:
    """Extract match targets from a classic week-wise roadmap entry."""
    targets: list[dict] = []
    week_data = next(
        (w for w in plan_obj.get("roadmap", []) if w.get("week") == week_number),
        None,
    )
    if not week_data:
        return targets
    for sb in week_data.get("subjects", []):
        targets.append({
            "subject": (sb.get("subject") or "").lower().strip(),
            "topic": (sb.get("topic") or "").lower().strip(),
            "subtopics": [s.lower().strip() for s in sb.get("subtopics", []) if s],
        })
    return targets


def extract_targets_for_unit(
    plan_obj: dict,
    unit_number: int,
    *,
    topic_wise: bool | None = None,
) -> tuple[list[dict], list[str], dict[str, Any]]:
    """
    Resolve match targets for a week number or topic sequence.

    Returns (targets, topic_labels, meta) where meta may include topic_id,
    priority, question_count, weightage.
    """
    if topic_wise is None:
        topic_wise = is_topic_wise_plan(plan_obj)

    if topic_wise:
        topic = get_topic_by_sequence(plan_obj, unit_number)
        if not topic:
            return [], [], {}
        label = topic.get("topic") or ""
        return (
            [topic_to_match_target(topic)],
            [label] if label else [],
            {
                "topic_id": topic.get("topic_id"),
                "priority": topic.get("priority", ""),
                "subject": topic.get("subject", ""),
                "question_count": (topic.get("test") or {}).get("question_count")
                or topic.get("question_count"),
                "subtopics": topic.get("subtopics") or [],
            },
        )

    targets = extract_week_targets(plan_obj, unit_number)
    labels = [t["topic"] for t in targets if t.get("topic")]
    week_data = next(
        (w for w in plan_obj.get("roadmap", []) if w.get("week") == unit_number),
        None,
    )
    weightage = week_data.get("weightage", 0) if week_data else 0
    return targets, labels, {"weightage": weightage}


def tests_required_for_plan(plan_obj: dict, duration_months: int | None) -> int:
    """How many sub-tests unlock the unit (week or topic). Topic-wise = 1."""
    if is_topic_wise_plan(plan_obj):
        return 1
    months = duration_months if duration_months is not None else 6
    return 2 if months >= 12 else 3


def total_units_for_template(plan_obj: dict, duration_months: int | None) -> int:
    """Total weeks or topics in the plan."""
    if is_topic_wise_plan(plan_obj):
        topics = plan_obj.get("topics") or []
        return int(plan_obj.get("total_topics") or len(topics))
    months = duration_months if duration_months is not None else 0
    return months * 4


def sample_topic_test_questions(
    questions: list[dict],
    *,
    size: int = TOPIC_WISE_TEST_SIZE,
    seed: str | None = None,
) -> list[dict]:
    """Pick up to ``size`` questions for a topic-wise test (deterministic shuffle)."""
    if not questions:
        return []
    if len(questions) <= size:
        return list(questions)

    import hashlib
    import random

    rng = random.Random(
        int(hashlib.md5((seed or "topic-test").encode()).hexdigest()[:8], 16)
    )
    pool = list(questions)
    rng.shuffle(pool)
    return pool[:size]
