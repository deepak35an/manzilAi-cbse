"""
Shared helpers for CBSE topic-wise study plan generation.

Subject-specific scripts set EXAM_KEY + QUESTION_BANK_PATH, then call run_pipeline().
SUBJECT_MATERIAL (topics + subtopics) is always derived from the PYQ JSON so names
and order match the source bank exactly.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
import re
import sys
from collections import OrderedDict
from pathlib import Path
from typing import Optional

import httpx
from dotenv import load_dotenv

BACKEND_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_ROOT))
load_dotenv(BACKEND_ROOT / ".env")

OUTPUT_DIR = Path(__file__).parent / "output"

GEMINI_API_URL = (
    "https://generativelanguage.googleapis.com/"
    "v1beta/models/gemini-3.8-flash:generateContent"
)


def slugify(value: str) -> str:
    """Create a stable lowercase snake_case identifier."""
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "_", value)
    return value.strip("_") or "topic"


def make_topic_id(subject: str, topic: str, used_ids: set[str]) -> str:
    """
    Build a unique topic_id. If two topics differ only by punctuation
    (e.g. hyphen vs en-dash) and collide after slugify, append a short
    hash of the exact topic string so both JSON topics are preserved.
    """
    base = f"topic_{slugify(subject)}_{slugify(topic)}"
    if base not in used_ids:
        return base
    digest = hashlib.sha1(topic.encode("utf-8")).hexdigest()[:8]
    candidate = f"{base}_{digest}"
    n = 2
    while candidate in used_ids:
        candidate = f"{base}_{digest}_{n}"
        n += 1
    return candidate


def build_subject_material_from_bank(bank_path: Path) -> str:
    """
    Build SUBJECT_MATERIAL text from a PYQ JSON list.

    Preserves first-appearance order of subjects, topics, and subtopics.
    Topic/subtopic strings are taken verbatim from the JSON.
    """
    if not bank_path.is_file():
        raise FileNotFoundError(f"Question bank not found: {bank_path}")

    bank = json.loads(bank_path.read_text(encoding="utf-8"))
    if not isinstance(bank, list):
        raise ValueError(f"Expected a JSON list in question bank: {bank_path}")

    # subject -> topic -> OrderedDict[subtopic -> count]
    tree: OrderedDict[str, OrderedDict[str, OrderedDict[str, int]]] = OrderedDict()

    for item in bank:
        if not isinstance(item, dict):
            continue
        subject = item.get("subject")
        topic = item.get("topic")
        subtopic = item.get("subtopic")
        if not isinstance(subject, str) or not subject.strip():
            raise ValueError("Question bank item missing subject.")
        if not isinstance(topic, str) or not topic.strip():
            raise ValueError("Question bank item missing topic.")
        if not isinstance(subtopic, str) or not subtopic.strip():
            raise ValueError(
                f"Question bank item missing subtopic for topic={topic!r}."
            )

        subject = subject.strip()
        topic = topic.strip()
        subtopic = subtopic.strip()

        if subject not in tree:
            tree[subject] = OrderedDict()
        if topic not in tree[subject]:
            tree[subject][topic] = OrderedDict()
        tree[subject][topic][subtopic] = tree[subject][topic].get(subtopic, 0) + 1

    if not tree:
        raise ValueError(f"No subjects/topics found in {bank_path}")

    lines: list[str] = []
    for subject, topics in tree.items():
        lines.append(f"SUBJECT: {subject}")
        for topic, subtopics in topics.items():
            question_count = sum(subtopics.values())
            lines.append(f"  TOPIC: {topic} | QUESTION_COUNT: {question_count}")
            for subtopic in subtopics:
                lines.append(f"    - {subtopic}")

    return "\n".join(lines)


def parse_subject_material(text: str) -> list[dict]:
    """Parse SUBJECT_MATERIAL into structured subject/topic/subtopic data."""
    subjects: list[dict] = []
    current_subject = None
    current_topic = None

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        if line.startswith("SUBJECT:"):
            subject_name = line.removeprefix("SUBJECT:").strip()
            current_subject = {"subject": subject_name, "topics": []}
            subjects.append(current_subject)
            current_topic = None

        elif line.startswith("TOPIC:"):
            if current_subject is None:
                raise ValueError("SUBJECT_MATERIAL contains a topic before a subject.")

            topic_part = line.removeprefix("TOPIC:").strip()
            match = re.match(r"^(.*?)\s*\|\s*QUESTION_COUNT:\s*(\d+)\s*$", topic_part)
            if match:
                topic_name = match.group(1).strip()
                question_count: Optional[int] = int(match.group(2))
            else:
                topic_name = topic_part.strip()
                question_count = None
            if not topic_name:
                raise ValueError(f"Invalid topic line in SUBJECT_MATERIAL: {line}")

            current_topic = {
                "subject": current_subject["subject"],
                "topic": topic_name,
                "question_count": question_count,
                "subtopics": [],
            }
            current_subject["topics"].append(current_topic)

        elif line.startswith("- "):
            if current_topic is None:
                raise ValueError("SUBJECT_MATERIAL contains a subtopic before a topic.")
            current_topic["subtopics"].append(line[2:].strip())

        else:
            raise ValueError(f"Unrecognised SUBJECT_MATERIAL line: {line}")

    if not subjects or not any(s["topics"] for s in subjects):
        raise ValueError("SUBJECT_MATERIAL did not contain any topics.")

    return subjects


def apply_question_counts_from_bank(
    subjects: list[dict],
    bank_path: Path,
) -> list[dict]:
    """Fill missing topic question_count values from the PYQ JSON bank."""
    missing = [
        topic
        for subject in subjects
        for topic in subject["topics"]
        if topic["question_count"] is None
    ]
    if not missing:
        return subjects

    if not bank_path.is_file():
        raise FileNotFoundError(
            f"QUESTION_COUNT omitted for {len(missing)} topic(s), but question bank "
            f"was not found at {bank_path}"
        )

    bank = json.loads(bank_path.read_text(encoding="utf-8"))
    if not isinstance(bank, list):
        raise ValueError(f"Expected a JSON list in question bank: {bank_path}")

    counts: dict[str, int] = {}
    for item in bank:
        topic_name = item.get("topic")
        if isinstance(topic_name, str) and topic_name:
            counts[topic_name] = counts.get(topic_name, 0) + 1

    unresolved = []
    for topic in missing:
        count = counts.get(topic["topic"])
        if count is None:
            unresolved.append(topic["topic"])
        else:
            topic["question_count"] = count

    if unresolved:
        raise ValueError(
            "No question_count found in the bank for topic(s): "
            + ", ".join(repr(name) for name in unresolved)
        )

    return subjects


def load_source_topics(exam_key: str, bank_path: Path) -> tuple[list[dict], list[dict], int, str]:
    """
    Return (SOURCE_SUBJECTS, SOURCE_TOPICS, TOTAL_SOURCE_QUESTIONS, SUBJECT_MATERIAL).
    Topics and subtopics come verbatim from the JSON bank.
    """
    subject_material = build_subject_material_from_bank(bank_path)
    source_subjects = apply_question_counts_from_bank(
        parse_subject_material(subject_material),
        bank_path,
    )
    source_topics = [topic for subject in source_subjects for topic in subject["topics"]]
    total = sum(topic["question_count"] for topic in source_topics)
    _ = exam_key  # reserved for future per-exam overrides
    return source_subjects, source_topics, total, subject_material


def priority_for(question_count: int, max_question_count: int) -> str:
    """Assign relative topic priority from the source question counts."""
    ratio = question_count / max_question_count if max_question_count else 0
    if ratio >= 0.80:
        return "CRITICAL"
    if ratio >= 0.55:
        return "HIGH"
    if ratio >= 0.30:
        return "MEDIUM"
    return "LOW"


def build_plan_from_source(
    exam_key: str,
    source_topics: list[dict],
    total_source_questions: int,
) -> dict:
    """
    Build the topic-wise plan deterministically from SUBJECT_MATERIAL / JSON source.

    Guarantees subject, topic, and subtopic names/order match the bank exactly.
    """
    max_count = max((topic["question_count"] for topic in source_topics), default=0)
    topics = []
    used_ids: set[str] = set()
    for index, source in enumerate(source_topics, start=1):
        topic_id = make_topic_id(source["subject"], source["topic"], used_ids)
        used_ids.add(topic_id)
        topics.append(
            {
                "topic_id": topic_id,
                "sequence": index,
                "subject": source["subject"],
                "topic": source["topic"],
                "question_count": source["question_count"],
                "priority": priority_for(source["question_count"], max_count),
                "test": {
                    "test_type": "FULL_TOPIC_TEST",
                    "question_count": source["question_count"],
                    "source": "question_bank",
                },
                "subtopics": list(source["subtopics"]),
            }
        )

    return {
        "exam": exam_key,
        "plan_type": "TOPIC_WISE_TESTS",
        "total_topics": len(topics),
        "total_subtopics": sum(len(t["subtopics"]) for t in topics),
        "source_question_count": total_source_questions,
        "topics": topics,
    }


def build_prompt(
    exam_key: str,
    source_topics: list[dict],
) -> str:
    topic_table = [
        {
            "subject": topic["subject"],
            "topic": topic["topic"],
            "question_count": topic["question_count"],
            "subtopics": topic["subtopics"],
        }
        for topic in source_topics
    ]
    max_count = max((topic["question_count"] for topic in source_topics), default=0)
    priorities = [
        {
            "subject": topic["subject"],
            "topic": topic["topic"],
            "question_count": topic["question_count"],
            "priority": priority_for(topic["question_count"], max_count),
        }
        for topic in source_topics
    ]

    return f"""
You are a professional exam-preparation strategist.

Generate a topic-wise study plan and test blueprint as valid JSON only.
The source syllabus below is the closed-world source of truth.

SOURCE TOPICS:
{json.dumps(topic_table, ensure_ascii=False, indent=2)}

PRIORITY GUIDANCE:
{json.dumps(priorities, ensure_ascii=False, indent=2)}

RULES:
1. Include every source topic exactly once, in exactly the source order.
2. Preserve every subject, topic, and subtopic name exactly as supplied.
3. Do not invent, rename, merge, or omit any topic or subtopic.
4. Do not create weeks, months, dates, a calendar, a study duration, or any
   duration field.
5. Each topic must have one FULL_TOPIC_TEST.
6. Create exactly one FULL_TOPIC_TEST per topic. Do not create separate test
   objects for each subtopic; return subtopics as a simple list of strings.
7. Set topic priority using the supplied priority guidance.
8. Use a unique lowercase snake_case topic_id in this exact form:
   "topic_<subject_slug>_<topic_slug>", where each slug is made by lowercasing
   the text and replacing each run of non-alphanumeric characters with "_",
   then trimming "_" from both ends.
9. Topic sequence numbers start at 1 and increase consecutively.
10. The question_count for each topic must equal the source count supplied.
11. Preserve the exact subtopic names and order from the source.
12. Do not invent test questions. The tests will be populated from the existing
    question bank by the application.
13. Output valid JSON only, with no Markdown fences or explanatory text.

OUTPUT SCHEMA:
{{
  "exam": "{exam_key}",
  "plan_type": "TOPIC_WISE_TESTS",
  "total_topics": <number>,
  "total_subtopics": <number>,
  "source_question_count": <number>,
  "topics": [
    {{
      "topic_id": "topic_example",
      "sequence": 1,
      "subject": "Subject name",
      "topic": "Topic name",
      "question_count": 10,
      "priority": "CRITICAL",
      "test": {{
        "test_type": "FULL_TOPIC_TEST",
        "question_count": 10,
        "source": "question_bank"
      }},
      "subtopics": ["Subtopic name", "Another subtopic"]
    }}
  ]
}}

Return the complete JSON now.
""".strip()


async def call_gemini(prompt: str) -> str:
    """Send the prompt to Gemini and return its response text."""
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not set in the backend .env file.")

    async with httpx.AsyncClient(timeout=300.0) as client:
        response = await client.post(
            f"{GEMINI_API_URL}?key={api_key}",
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "temperature": 0.1,
                    "maxOutputTokens": 32768,
                    "topP": 0.95,
                    "responseMimeType": "application/json",
                },
            },
        )
        response.raise_for_status()
        data = response.json()

    candidates = data.get("candidates", [])
    if not candidates:
        raise RuntimeError(
            f"Gemini returned no candidates. Feedback: {data.get('promptFeedback', {})}"
        )

    parts = candidates[0].get("content", {}).get("parts", [])
    raw_text = "".join(
        part.get("text", "") for part in parts if "text" in part
    ).strip()
    if not raw_text:
        finish_reason = candidates[0].get("finishReason", "UNKNOWN")
        raise RuntimeError(
            f"Gemini returned an empty response. Finish reason: {finish_reason}"
        )
    return raw_text


def parse_plan_json(raw: str) -> dict:
    """Strip optional Markdown fences and parse the JSON response."""
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1]
        if "```" in text:
            text = text.rsplit("```", 1)[0]
    return json.loads(text.strip())


def validate_plan(
    plan: dict,
    exam_key: str,
    source_topics: list[dict],
    total_source_questions: int,
) -> None:
    """Validate structure, order, names, IDs, priorities, and no duration fields."""
    if not isinstance(plan, dict):
        raise ValueError("Plan must be a JSON object.")
    if plan.get("exam") != exam_key:
        raise ValueError(f"Expected exam={exam_key!r}, got {plan.get('exam')!r}.")
    if plan.get("plan_type") != "TOPIC_WISE_TESTS":
        raise ValueError("plan_type must be 'TOPIC_WISE_TESTS'.")

    topics = plan.get("topics")
    if not isinstance(topics, list) or len(topics) != len(source_topics):
        raise ValueError(
            f"Expected {len(source_topics)} topics, got "
            f"{len(topics) if isinstance(topics, list) else 'invalid topics field'}."
        )
    if plan.get("total_topics") != len(topics):
        raise ValueError("total_topics must equal the number of topic entries.")

    expected_subtopic_total = sum(len(topic["subtopics"]) for topic in source_topics)
    actual_subtopic_total = sum(
        len(topic.get("subtopics", []))
        for topic in topics
        if isinstance(topic, dict) and isinstance(topic.get("subtopics"), list)
    )
    if plan.get("total_subtopics") != expected_subtopic_total:
        raise ValueError(f"total_subtopics must be {expected_subtopic_total}.")
    if actual_subtopic_total != expected_subtopic_total:
        raise ValueError(
            f"Expected {expected_subtopic_total} subtopic entries, got {actual_subtopic_total}."
        )
    if plan.get("source_question_count") != total_source_questions:
        raise ValueError(
            f"source_question_count must be {total_source_questions}."
        )

    forbidden_fields = {
        "duration", "duration_months", "duration_weeks", "weeks",
        "start_date", "end_date", "calendar",
    }
    if forbidden_fields.intersection(plan):
        raise ValueError("Plan must not contain duration or calendar fields.")

    max_count = max((topic["question_count"] for topic in source_topics), default=0)
    seen_topic_ids: set[str] = set()
    expected_ids: list[str] = []
    for source in source_topics:
        expected_id = make_topic_id(source["subject"], source["topic"], set(expected_ids))
        expected_ids.append(expected_id)
    valid_priorities = {"CRITICAL", "HIGH", "MEDIUM", "LOW"}

    for index, (item, source, expected_id) in enumerate(
        zip(topics, source_topics, expected_ids), start=1
    ):
        if not isinstance(item, dict):
            raise ValueError(f"Topic entry {index} must be an object.")
        if item.get("sequence") != index:
            raise ValueError(f"Expected topic sequence {index}.")

        if item.get("topic_id") != expected_id:
            raise ValueError(
                f"Invalid topic_id for {source['topic']!r}; expected {expected_id!r}."
            )
        if item["topic_id"] in seen_topic_ids:
            raise ValueError(f"Duplicate topic_id: {item['topic_id']}")
        seen_topic_ids.add(item["topic_id"])

        if item.get("subject") != source["subject"] or item.get("topic") != source["topic"]:
            raise ValueError(
                f"Topic {index} does not match source order/name: "
                f"expected {source['subject']} / {source['topic']}."
            )
        if item.get("question_count") != source["question_count"]:
            raise ValueError(
                f"Incorrect question_count for {source['topic']!r}; "
                f"expected {source['question_count']}."
            )

        expected_priority = priority_for(source["question_count"], max_count)
        if item.get("priority") != expected_priority or item.get("priority") not in valid_priorities:
            raise ValueError(
                f"Incorrect priority for {source['topic']!r}; expected {expected_priority}."
            )

        if item.get("test", {}).get("test_type") != "FULL_TOPIC_TEST":
            raise ValueError(f"Missing FULL_TOPIC_TEST for {source['topic']!r}.")

        subtopics = item.get("subtopics")
        if not isinstance(subtopics, list) or subtopics != source["subtopics"]:
            raise ValueError(
                f"Subtopic names/order differ from the source for {source['topic']!r}."
            )

    print(
        f"Validated {len(topics)} topics and {expected_subtopic_total} subtopics; "
        "names, order, counts, IDs, priorities, and topic-test types match."
    )


async def upsert_to_db(exam_key: str, plan_text: str) -> Optional[str]:
    """Optional database upsert for a durationless topic-wise template."""
    db_url = os.environ.get("DATABASE_URL", "").strip()
    if not db_url:
        raise RuntimeError("DATABASE_URL not set in the backend .env file.")

    try:
        from sqlalchemy import inspect, select
        from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
        from sqlalchemy.orm import sessionmaker
        from app.models.quiz import StudyPlanTemplate
    except ImportError as exc:
        raise RuntimeError(f"Database dependencies/model could not be imported: {exc}") from exc

    mapper = inspect(StudyPlanTemplate)
    columns = {column.key: column for column in mapper.columns}
    duration_column = columns.get("duration_months")
    if (
        duration_column is not None
        and not duration_column.nullable
        and duration_column.default is None
        and duration_column.server_default is None
    ):
        raise RuntimeError(
            "StudyPlanTemplate requires duration_months. The generated plan has no "
            "duration, so update the model/database schema to support durationless "
            "templates before enabling this upsert. JSON/TXT files are already saved."
        )

    engine = create_async_engine(db_url, echo=False)
    async_session = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    try:
        async with async_session() as session:
            result = await session.execute(
                select(StudyPlanTemplate).where(
                    StudyPlanTemplate.exam == exam_key,
                    StudyPlanTemplate.duration_months.is_(None),
                )
            )
            matches = result.scalars().all()
            if len(matches) > 1:
                raise RuntimeError(
                    f"Found {len(matches)} topic-wise templates for exam={exam_key!r}. "
                    "Please choose/clean up the existing records before upserting."
                )

            if matches:
                existing = matches[0]
                existing.plan = plan_text
                if duration_column is not None:
                    existing.duration_months = None
                await session.commit()
                return str(existing.id)

            kwargs = {"exam": exam_key, "plan": plan_text}
            if duration_column is not None:
                kwargs["duration_months"] = None
            new_template = StudyPlanTemplate(**kwargs)
            session.add(new_template)
            await session.flush()
            template_id = str(new_template.id)
            await session.commit()
            return template_id
    finally:
        await engine.dispose()


async def run_pipeline(
    exam_key: str,
    question_bank_path: Path,
    *,
    use_gemini: bool = False,
    upsert: bool | None = None,
    write_subject_material: bool = True,
) -> Path:
    """
    Generate and save a topic-wise plan for one exam/subject.

    By default the plan is built deterministically from the JSON bank so topic
    and subtopic names are identical to the source. Pass use_gemini=True to
    request Gemini instead (still validated against the JSON source).
    """
    source_subjects, source_topics, total_q, subject_material = load_source_topics(
        exam_key, question_bank_path
    )

    print("=" * 72)
    print("TOPIC-WISE STUDY PLAN AND TEST GENERATION")
    print("=" * 72)
    print(f"Exam            : {exam_key}")
    print(f"Question bank   : {question_bank_path}")
    print(f"Subjects        : {len(source_subjects)}")
    print(f"Topics          : {len(source_topics)}")
    print(
        f"Subtopics       : {sum(len(t['subtopics']) for t in source_topics)}"
    )
    print(f"Source questions: {total_q}")
    print(f"Generator       : {'Gemini' if use_gemini else 'JSON (exact topics/subtopics)'}")
    print("Duration        : Not used")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    if write_subject_material:
        material_path = OUTPUT_DIR / f"{exam_key}_SUBJECT_MATERIAL.txt"
        material_path.write_text(subject_material + "\n", encoding="utf-8")
        print(f"SUBJECT_MATERIAL: {material_path}")

    try:
        if use_gemini:
            print("Generating plan with Gemini...")
            raw_response = await call_gemini(build_prompt(exam_key, source_topics))
            plan = parse_plan_json(raw_response)
        else:
            print("Building plan directly from JSON SUBJECT_MATERIAL...")
            plan = build_plan_from_source(exam_key, source_topics, total_q)
        validate_plan(plan, exam_key, source_topics, total_q)
    except (httpx.HTTPError, RuntimeError, json.JSONDecodeError, ValueError) as exc:
        print(f"\nERROR: {exc}")
        sys.exit(1)

    base_name = f"{exam_key}_topicwise_test_plan"
    json_path = OUTPUT_DIR / f"{base_name}.json"
    txt_path = OUTPUT_DIR / f"{base_name}.txt"

    plan_json = json.dumps(plan, indent=2, ensure_ascii=False)
    json_path.write_text(plan_json + "\n", encoding="utf-8")
    txt_path.write_text(
        f"=== {exam_key} | Topic-wise tests ===\n{plan_json}\n",
        encoding="utf-8",
    )

    print("\nGenerated plan saved:")
    print(f"  JSON: {json_path}")
    print(f"  TXT : {txt_path}")

    if upsert is None:
        try:
            answer = input("\nUpsert this plan to the database? [y/N]: ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            answer = "n"
            print()
        do_upsert = answer == "y"
    else:
        do_upsert = upsert

    if do_upsert:
        try:
            template_id = await upsert_to_db(
                exam_key, json.dumps(plan, ensure_ascii=False)
            )
            print(f"Database upsert completed. Template ID: {template_id}")
        except Exception as exc:
            print(f"Database upsert failed: {exc}")
            print("The generated JSON and TXT files remain saved.")
    else:
        print("Database upsert skipped.")

    return json_path


def parse_cli_args(description: str) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument(
        "--use-gemini",
        action="store_true",
        help="Ask Gemini to format the plan (still validated against JSON topics/subtopics).",
    )
    parser.add_argument(
        "--upsert",
        action="store_true",
        help="Upsert the generated plan into the database without prompting.",
    )
    parser.add_argument(
        "--no-upsert",
        action="store_true",
        help="Skip the database upsert prompt.",
    )
    return parser.parse_args()


def upsert_flag_from_args(args: argparse.Namespace) -> bool | None:
    if args.upsert:
        return True
    if args.no_upsert:
        return False
    return None
