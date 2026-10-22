
"""
================================================================================
TOPIC-WISE STUDY PLAN GENERATION PIPELINE
================================================================================

Standalone script that generates topic-wise study plans via Gemini AI and
optionally upserts them into the study_plan_templates database table.

USAGE:
    python pipelines/generate_study_plan.py

WORKFLOW:
    1. Edit the CONFIG section at the top of this file.
    2. Edit SUBJECT_MATERIAL with your exam syllabus.
    3. Run: python pipelines/generate_study_plan.py
    4. Review the generated plan.
    5. The plan is saved to:
         pipelines/output/<exam>_<months>m_plan.json
         pipelines/output/<exam>_<months>m_plan.txt
    6. If you confirm the prompt, the plan is upserted into the database.

OUTPUT FORMAT:
    === <EXAM_KEY> | <N> months | ID: <uuid> ===
    {
      "duration_months": N,
      "total_topics": ...,
      "topics": [...]
    }

================================================================================
"""

import asyncio
import json
import os
import re
import sys
from pathlib import Path
from typing import Optional

import httpx
from dotenv import load_dotenv


# ── Ensure we can import from the backend root ────────────────────────────────

BACKEND_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_ROOT))

load_dotenv(BACKEND_ROOT / ".env")


# ══════════════════════════════════════════════════════════════════════════════
# CONFIG — Edit these before running
# ══════════════════════════════════════════════════════════════════════════════

# Must match the exam identifier used by your application.
EXAM_KEY: str = "CUET_GAT"

# Duration is metadata; topics are not assigned to specific weeks.
DURATION_MONTHS: int = 9

# Output folder relative to this file.
OUTPUT_DIR = Path(__file__).parent / "output"


# ══════════════════════════════════════════════════════════════════════════════
# SUBJECT MATERIAL — Edit your syllabus here
# ══════════════════════════════════════════════════════════════════════════════

SUBJECT_MATERIAL = """
General Knowledge

Static General Knowledge
- Indian History
- Indian Geography
- Indian Polity
- Indian Economy
- Indian Culture
- Art and Culture
- Important Days
- National Symbols
- Awards and Honours
- Books and Authors
- Sports
- International Organizations
- Countries and Capitals
- Science and Technology
- Important Government Schemes

Current Affairs
- National Current Affairs
- International Current Affairs
- Economy and Banking
- Science and Technology
- Sports Current Affairs
- Awards and Honours
- Government Policies
- Environment
- Important Summits
- Reports and Indices

General Mental Ability
- Number Series
- Alphabet Series
- Coding-Decoding
- Blood Relations
- Direction Sense
- Ranking and Ordering
- Calendar
- Clock
- Puzzle
- Analogy
- Classification

Numerical Ability
- Number System
- Simplification
- Percentage
- Ratio and Proportion
- Average
- Profit and Loss
- Simple Interest
- Compound Interest
- Time and Work
- Pipes and Cisterns
- Time, Speed and Distance
- Boats and Streams
- Partnership
- Mixture and Alligation

Quantitative Aptitude
- Algebra
- Linear Equations
- Geometry
- Lines and Angles
- Triangles
- Circles
- Mensuration
- 2D Mensuration
- 3D Mensuration
- Statistics
- Mean
- Median
- Mode
- Probability (Basic)

Logical and Analytical Reasoning
- Logical Reasoning
- Statement and Conclusion
- Statement and Assumption
- Syllogism
- Cause and Effect
- Assertion and Reason
- Data Sufficiency
- Venn Diagrams
- Logical Puzzles
- Analytical Reasoning

General Science
- Physics Basics
- Chemistry Basics
- Biology Basics
- Scientific Developments
- Everyday Science

Environment Literacy
- Ecosystem
- Biodiversity
- Climate Change
- Global Warming
- Pollution
- Renewable Energy
- Sustainable Development
- Environmental Conservation
- Environmental Organizations
- Environmental Laws
"""


# ══════════════════════════════════════════════════════════════════════════════
# PRIORITY TABLE — Used as weighting guidance for the AI
# ══════════════════════════════════════════════════════════════════════════════

PRIORITY_DATA = """
Topic | Difficulty | Weightage | Priority
--- | --- | --- | ---
Current Affairs | Easy | 20-25% | CRITICAL
Static General Knowledge | Medium | 15-20% | CRITICAL
General Mental Ability | Easy-Medium | 15-18% | CRITICAL
Numerical Ability | Medium | 12-15% | HIGH
Logical and Analytical Reasoning | Medium | 15-18% | CRITICAL
Quantitative Aptitude | Medium | 10-12% | HIGH
General Science | Easy-Medium | 8-10% | HIGH
Environment Literacy | Easy | 5-8% | MEDIUM
"""


# ══════════════════════════════════════════════════════════════════════════════
# PIPELINE LOGIC
# ══════════════════════════════════════════════════════════════════════════════

GEMINI_API_URL = (
    "https://generativelanguage.googleapis.com/"
    "v1beta/models/gemini-2.5-flash:generateContent"
)


PLAN_PROMPT = """
You are a PROFESSIONAL EXAM PREPARATION STRATEGIST.

Generate a structured, machine-readable TOPIC-WISE study plan.

==================================================
INPUT
==================================================

DURATION_MONTHS:
{duration_months}

TOPIC_TABLE:
{topic_table}

PRIORITY_DATA:
{priority_data}

==================================================
PRIMARY OBJECTIVE
==================================================

Generate a complete topic-wise study plan for the examination.

The plan will be used to:

1. Generate quizzes for individual topics.
2. Fetch questions from a question pool.
3. Track topic and subtopic completion.
4. Recommend the next topic to study.
5. Generate revision schedules.
6. Measure preparation progress.

Students must be able to study at their own pace.

Do NOT assign topics to weeks or calendar dates.

==================================================
STRICT RULES
==================================================

1. TOPIC-WISE STRUCTURE

- Every syllabus topic must have its own entry.
- Do not combine multiple syllabus topics into one entry.
- Every entry must belong to its correct subject.
- Every topic must have its own subtopics list.
- Do not create week objects or a weekly roadmap.

2. CLOSED-WORLD CONSTRAINT

- Use only subjects and topics listed in TOPIC_TABLE.
- Never invent new syllabus topics or subtopics.
- Do not introduce unrelated concepts.
- Do not add artificial topics to fill the duration.

3. PRESERVE THE SYLLABUS

- Preserve the subject order from TOPIC_TABLE.
- Preserve the topic order within each subject.
- Include every listed syllabus topic exactly once.
- Do not skip, combine, or duplicate topics.
- Preserve the original topic names.
- Do not confuse the introductory exam/category heading with
  an additional subject.

4. SUBTOPICS

- Use only explicitly listed topics and subtopics.
- TOPIC_TABLE may contain a flat list of topics under a subject.
- When a topic has no separately listed subtopics, use the
  topic name itself as its single subtopic.
- Do not invent subdivisions.

5. PRIORITY

- Use PRIORITY_DATA to determine each topic's priority.
- Map the priority of a subject to its individual topics.
- Allowed priorities: CRITICAL, HIGH, MEDIUM, LOW.
- If a subject has no priority mapping, use MEDIUM.
- Use the same subject naming consistently.

6. STUDY ORDER

- Assign sequence numbers starting from 1.
- Sequence numbers must be consecutive and unique.
- Keep topics of each subject together.
- Follow the exact order in TOPIC_TABLE.
- Do not assign week numbers, month numbers, or calendar dates
  to individual topics.

7. DURATION

- Include DURATION_MONTHS in the output.
- Duration represents the intended overall preparation period.
- Do not omit, combine, or duplicate topics to fit the duration.
- Do not invent topics to fill the duration.

8. TOPIC IDENTIFIERS

- Generate a unique, stable topic_id for each topic.
- Use lowercase snake_case.
- Include a shortened subject identifier and topic name.
- Identifiers must be unique across the entire plan.
- Do not use sequence numbers as the only identifier.

9. MACHINE-READABLE OUTPUT

- Return valid JSON only.
- Do not return Markdown, explanations, or comments.
- Do not use trailing commas.
- Every topic must contain all required fields.
- Ensure the JSON is complete and properly closed.

==================================================
OUTPUT FORMAT
==================================================

{{
  "duration_months": {duration_months},
  "total_topics": 2,
  "topics": [
    {{
      "topic_id": "static_general_knowledge_indian_history",
      "sequence": 1,
      "subject": "Static General Knowledge",
      "topic": "Indian History",
      "priority": "CRITICAL",
      "subtopics": [
        "Indian History"
      ]
    }},
    {{
      "topic_id": "static_general_knowledge_indian_geography",
      "sequence": 2,
      "subject": "Static General Knowledge",
      "topic": "Indian Geography",
      "priority": "CRITICAL",
      "subtopics": [
        "Indian Geography"
      ]
    }}
  ]
}}

The example illustrates the schema only. Do not limit the actual
output to two topics.

Generate every topic in TOPIC_TABLE in the exact required order.
The total_topics value must equal the number of topic entries.

Return the complete JSON now.
"""


def _print_separator(char: str = "=", width: int = 72) -> None:
    print(char * width)


def _format_header(
    exam_key: str,
    duration_months: int,
    template_id: Optional[str] = None,
) -> str:
    id_part = f" | ID: {template_id}" if template_id else ""
    return f"=== {exam_key} | {duration_months} months{id_part} ==="


def _slugify(value: str) -> str:
    """Convert a string to a lowercase snake_case identifier."""
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "_", value)
    return value.strip("_")


async def call_gemini(prompt: str) -> str:
    """Send the prompt to Gemini and return the raw text response."""

    api_key = os.environ.get("GEMINI_API_KEY", "")

    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not set in .env")

    async with httpx.AsyncClient(timeout=300.0) as client:
        response = await client.post(
            f"{GEMINI_API_URL}?key={api_key}",
            json={
                "contents": [
                    {
                        "parts": [
                            {"text": prompt}
                        ]
                    }
                ],
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
        feedback = data.get("promptFeedback", {})
        raise RuntimeError(
            f"Gemini returned no candidates. Feedback: {feedback}"
        )

    content = candidates[0].get("content", {})
    parts = content.get("parts", [])

    raw_text = "".join(
        part.get("text", "")
        for part in parts
        if "text" in part
    ).strip()

    if not raw_text:
        finish_reason = candidates[0].get("finishReason", "UNKNOWN")
        raise RuntimeError(
            "Gemini returned an empty response. "
            f"Finish reason: {finish_reason}"
        )

    return raw_text


def parse_plan_json(raw: str) -> dict:
    """Strip optional Markdown fences and parse the JSON response."""

    text = raw.strip()

    if text.startswith("```"):
        text = text.split("\n", 1)[1]

        if "```" in text:
            text = text.rsplit("```", 1)[0]

        text = text.strip()

    return json.loads(text)


def validate_plan(plan: dict, expected_months: int) -> None:
    """Validate the topic-wise plan structure and required fields."""

    if not isinstance(plan, dict):
        raise ValueError("Plan must be a JSON object")

    if plan.get("duration_months") != expected_months:
        raise ValueError(
            f"Expected duration_months={expected_months}, "
            f"got {plan.get('duration_months')!r}"
        )

    topics = plan.get("topics")

    if not isinstance(topics, list) or not topics:
        raise ValueError("'topics' must be a non-empty list")

    if plan.get("total_topics") != len(topics):
        raise ValueError(
            f"total_topics must equal {len(topics)}, "
            f"got {plan.get('total_topics')!r}"
        )

    valid_priorities = {"CRITICAL", "HIGH", "MEDIUM", "LOW"}
    seen_ids = set()
    seen_topic_pairs = set()

    for index, item in enumerate(topics, start=1):
        if not isinstance(item, dict):
            raise ValueError(f"Topic entry {index} must be an object")

        required_fields = (
            "topic_id",
            "sequence",
            "subject",
            "topic",
            "priority",
            "subtopics",
        )

        for key in required_fields:
            if key not in item:
                raise ValueError(
                    f"Topic entry {index} is missing '{key}'"
                )

        for key in ("topic_id", "subject", "topic", "priority"):
            if not isinstance(item[key], str) or not item[key].strip():
                raise ValueError(
                    f"Topic entry {index} has an empty or invalid '{key}'"
                )

        sequence = item["sequence"]

        if (
            isinstance(sequence, bool)
            or not isinstance(sequence, int)
            or sequence != index
        ):
            raise ValueError(
                f"Expected sequence {index}, got {sequence!r}"
            )

        topic_id = item["topic_id"]

        if topic_id in seen_ids:
            raise ValueError(f"Duplicate topic_id: {topic_id}")

        seen_ids.add(topic_id)

        topic_pair = (
            item["subject"].strip().casefold(),
            item["topic"].strip().casefold(),
        )

        if topic_pair in seen_topic_pairs:
            raise ValueError(
                f"Duplicate topic '{item['topic']}' "
                f"under subject '{item['subject']}'"
            )

        seen_topic_pairs.add(topic_pair)

        priority = item["priority"].upper()

        if priority not in valid_priorities:
            raise ValueError(
                f"Invalid priority for '{item['topic']}': "
                f"{item['priority']}"
            )

        item["priority"] = priority

        subtopics = item["subtopics"]

        if not isinstance(subtopics, list) or not subtopics:
            raise ValueError(
                f"Subtopics for '{item['topic']}' must be a "
                "non-empty list"
            )

        if not all(
            isinstance(subtopic, str) and subtopic.strip()
            for subtopic in subtopics
        ):
            raise ValueError(
                f"Invalid subtopic in '{item['topic']}'"
            )

        # Keep IDs consistent with the subject and topic.
        # Duplicate detection above prevents ID collisions.
        expected_id = (
            f"{_slugify(item['subject'])}_{_slugify(item['topic'])}"
        )

        if topic_id != expected_id:
            print(
                f"  ⚠  Topic ID differs from the standard format: "
                f"{topic_id} (expected: {expected_id})"
            )

    print(f"  ✔  {len(topics)} topic entries validated")
    print("  ✔  Sequence numbers and topic IDs checked")
    print("  ✔  Required fields and priorities validated")


async def upsert_to_db(
    exam_key: str,
    duration_months: int,
    plan_text: str,
) -> str:
    """Upsert the topic-wise plan into study_plan_templates."""

    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
    from sqlalchemy.orm import sessionmaker

    db_url = os.environ.get("DATABASE_URL", "")

    if not db_url:
        raise RuntimeError("DATABASE_URL not set in .env")

    engine = create_async_engine(db_url, echo=False)

    async_session = sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    try:
        async with async_session() as session:
            from app.models.quiz import StudyPlanTemplate

            result = await session.execute(
                select(StudyPlanTemplate).where(
                    StudyPlanTemplate.exam == exam_key,
                    StudyPlanTemplate.duration_months == duration_months,
                )
            )

            existing = result.scalar_one_or_none()

            if existing:
                existing.plan = plan_text
                await session.commit()

                template_id = str(existing.id)

                print(
                    f"  ✔  Updated existing template "
                    f"ID: {template_id}"
                )
            else:
                new_template = StudyPlanTemplate(
                    exam=exam_key,
                    duration_months=duration_months,
                    plan=plan_text,
                )

                session.add(new_template)
                await session.flush()

                template_id = str(new_template.id)

                await session.commit()

                print(
                    f"  ✔  Inserted new template "
                    f"ID: {template_id}"
                )

        return template_id

    finally:
        await engine.dispose()


async def main() -> None:
    """Generate, validate, save, and optionally upsert the plan."""

    if DURATION_MONTHS <= 0:
        raise ValueError("DURATION_MONTHS must be greater than zero")

    if not SUBJECT_MATERIAL.strip():
        raise ValueError("SUBJECT_MATERIAL cannot be empty")

    _print_separator()
    print("  TOPIC-WISE STUDY PLAN GENERATION PIPELINE")
    _print_separator()
    print(f"  Exam       : {EXAM_KEY}")
    print(f"  Duration   : {DURATION_MONTHS} months")
    print("  Plan type  : Topic-wise")
    print("  Upsert DB  : Will ask after review")
    _print_separator()

    # ── Build prompt ─────────────────────────────────────────────────────────

    prompt = PLAN_PROMPT.format(
        duration_months=DURATION_MONTHS,
        topic_table=SUBJECT_MATERIAL.strip(),
        priority_data=PRIORITY_DATA.strip(),
    )

    # ── Call Gemini ───────────────────────────────────────────────────────────

    print("\n[1/4] Calling Gemini API ...")

    try:
        raw_response = await call_gemini(prompt)
    except (httpx.HTTPError, RuntimeError) as exc:
        print(f"\n  ✘  Gemini API error: {exc}")
        sys.exit(1)

    # ── Parse response ───────────────────────────────────────────────────────

    print("[2/4] Parsing topic-wise JSON ...")

    try:
        plan = parse_plan_json(raw_response)
    except json.JSONDecodeError as exc:
        print(f"\n  ✘  Failed to parse JSON: {exc}")
        print("  Raw response (first 1000 characters):")
        print(raw_response[:1000])
        sys.exit(1)

    # ── Validate plan ────────────────────────────────────────────────────────

    print("[3/4] Validating topic-wise plan ...")

    try:
        validate_plan(plan, DURATION_MONTHS)
    except ValueError as exc:
        print(f"\n  ✘  Validation error: {exc}")
        sys.exit(1)

    # ── Save output files ────────────────────────────────────────────────────

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    base_name = f"{EXAM_KEY}_{DURATION_MONTHS}m_plan"

    dump_path = OUTPUT_DIR / f"{base_name}.txt"
    json_path = OUTPUT_DIR / f"{base_name}.json"

    plan_json_str = json.dumps(
        plan,
        indent=2,
        ensure_ascii=False,
    )

    header_no_id = _format_header(
        EXAM_KEY,
        DURATION_MONTHS,
    )

    # Text file: header + formatted JSON.
    with open(dump_path, "w", encoding="utf-8") as file:
        file.write(f"{header_no_id}\n{plan_json_str}\n")

    # JSON file: valid JSON only.
    with open(json_path, "w", encoding="utf-8") as file:
        file.write(plan_json_str + "\n")

    # ── Display complete plan for review ─────────────────────────────────────

    _print_separator()
    print("\n  GENERATED TOPIC-WISE PLAN\n")
    print(header_no_id)
    print(plan_json_str)
    _print_separator()

    print(f"\n  ✔  {len(plan['topics'])} topics generated")
    print(f"  ✔  Dump (header + JSON) : {dump_path}")
    print(f"  ✔  Clean JSON           : {json_path}\n")

    # ── Interactive database upsert ───────────────────────────────────────────

    _print_separator("-")

    try:
        answer = input(
            "  Upsert this topic-wise plan to the database? [y/N]: "
        ).strip().lower()
    except (EOFError, KeyboardInterrupt):
        answer = "n"
        print()

    if answer == "y":
        print("\n[4/4] Upserting topic-wise plan to database ...")

        plan_text = json.dumps(
            plan,
            ensure_ascii=False,
        )

        try:
            template_id = await upsert_to_db(
                EXAM_KEY,
                DURATION_MONTHS,
                plan_text,
            )

            # Rewrite the text dump with the database ID.
            header_with_id = _format_header(
                EXAM_KEY,
                DURATION_MONTHS,
                template_id,
            )

            with open(dump_path, "w", encoding="utf-8") as file:
                file.write(f"{header_with_id}\n{plan_json_str}\n")

            print(f"  ✔  Dump file updated with DB ID: {dump_path}")

        except Exception as exc:
            print(f"  ✘  Database upsert failed: {exc}")
            print("  The generated plan remains saved to the output files.")
    else:
        print("  Skipped. Plan is saved to files only.")

    _print_separator()
    print()


if __name__ == "__main__":
    asyncio.run(main())
