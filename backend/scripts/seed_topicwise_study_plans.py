"""
seed_topicwise_study_plans.py
=============================
Seeds durationless (topic-wise) study plan templates from pipelines/output.

Looks for files matching:
  *_topicwise_test_plan.json
  *_topic_plan.json

Each plan JSON must include "exam" and "plan_type": "TOPIC_WISE_TESTS".
Templates are stored with duration_months = NULL.

Run (from project root, Docker):
    docker compose exec backend python scripts/seed_topicwise_study_plans.py

Safe to re-run: updates existing topic-wise rows for the same exam.
"""

from __future__ import annotations

import asyncio
import json
import os
import uuid
from pathlib import Path

try:
    import asyncpg
except ImportError:
    raise SystemExit("asyncpg not installed. Run: pip install asyncpg")


def _get_db_url() -> str:
    env_url = os.getenv("DATABASE_URL")
    if env_url:
        return env_url.replace("postgresql+asyncpg://", "postgresql://")

    env_file = Path(__file__).parent.parent / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("DATABASE_URL="):
                return line.split("=", 1)[1].strip().strip('"').replace(
                    "postgresql+asyncpg://", "postgresql://"
                )

    return "postgresql://postgres:postgres@localhost:5432/assessment_db"


def load_topicwise_plans() -> list[dict]:
    output_dir = Path(__file__).parent.parent / "pipelines" / "output"
    if not output_dir.exists():
        print(f"Warning: Output directory does not exist: {output_dir}")
        return []

    patterns = ("*_topicwise_test_plan.json", "*_topic_plan.json")
    files: list[Path] = []
    for pattern in patterns:
        files.extend(sorted(output_dir.glob(pattern)))

    # Deduplicate by path
    files = sorted(set(files), key=lambda p: p.name)
    templates: list[dict] = []

    for filepath in files:
        try:
            plan_obj = json.loads(filepath.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            print(f"Error parsing {filepath.name}: {exc}")
            continue

        if not isinstance(plan_obj, dict):
            print(f"Skipping {filepath.name}: root JSON must be an object")
            continue

        exam = plan_obj.get("exam")
        if not exam:
            print(f"Skipping {filepath.name}: missing exam field")
            continue

        plan_type = plan_obj.get("plan_type")
        if plan_type and plan_type != "TOPIC_WISE_TESTS":
            print(f"Skipping {filepath.name}: plan_type={plan_type!r}")
            continue

        # Ensure plan_type is set for consumers
        plan_obj["plan_type"] = "TOPIC_WISE_TESTS"

        template_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"topicwise:{exam}"))
        templates.append({
            "id": template_id,
            "exam": exam,
            "duration_months": None,
            "plan": plan_obj,
            "filepath": filepath.name,
        })

    return templates


async def seed() -> None:
    db_url = _get_db_url()
    print(f"Connecting to database: {db_url}")

    try:
        conn = await asyncpg.connect(db_url)
    except Exception as exc:
        print(f"Failed to connect to database: {exc}")
        return

    templates = load_topicwise_plans()
    print(f"Found {len(templates)} topic-wise plan file(s) to seed/update.\n")

    inserted_or_updated = 0
    errors = 0

    for t in templates:
        plan_json = json.dumps(t["plan"], ensure_ascii=False)
        try:
            existing_id = await conn.fetchval(
                """
                SELECT id FROM study_plan_templates
                WHERE exam = $1 AND duration_months IS NULL
                """,
                t["exam"],
            )
            if existing_id:
                await conn.execute(
                    """
                    UPDATE study_plan_templates
                    SET plan = $1, created_at = NOW()
                    WHERE id = $2
                    """,
                    plan_json,
                    existing_id,
                )
                print(f"  [UPDATED] {t['exam']} (topic-wise) <- {t['filepath']} id={existing_id}")
            else:
                await conn.execute(
                    """
                    INSERT INTO study_plan_templates (id, exam, duration_months, plan, created_at)
                    VALUES ($1::uuid, $2, NULL, $3, NOW())
                    """,
                    t["id"],
                    t["exam"],
                    plan_json,
                )
                print(f"  [INSERTED] {t['exam']} (topic-wise) <- {t['filepath']} id={t['id']}")
            inserted_or_updated += 1
        except Exception as exc:
            print(f"  [ERROR] {t['exam']} ({t['filepath']}): {exc}")
            errors += 1

    await conn.close()
    print(f"\nDone. {inserted_or_updated} processed, {errors} error(s).")


if __name__ == "__main__":
    asyncio.run(seed())
