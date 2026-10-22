"""
seed_cuet_study_plans.py
========================
Automatically reads generated CUET study plan JSON files from the
`pipelines/output` subfolder and seeds/upserts them into the `study_plan_templates` table.

Run once after generating CUET study plans:
    python scripts/seed_cuet_study_plans.py

Requirements:
    pip install asyncpg python-dotenv

The script reads DATABASE_URL from .env (or falls back to default localhost).
It uses ON CONFLICT (exam, duration_months) DO UPDATE so running it multiple times
updates the database templates with the latest generated output files.
"""

import asyncio
import os
import json
import re
import uuid
from datetime import datetime
from pathlib import Path

try:
    import asyncpg
except ImportError:
    raise SystemExit("asyncpg not installed. Run: pip install asyncpg")


# ── Database URL Helper ──────────────────────────────────────────────────────
def _get_db_url() -> str:
    # Prefer DATABASE_URL provided by Docker env (set via .env.docker)
    env_url = os.getenv("DATABASE_URL")
    if env_url:
        return env_url.replace("postgresql+asyncpg://", "postgresql://")

    # Local development fallback
    env_file = Path(__file__).parent.parent / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("DATABASE_URL="):
                raw = line.split("=", 1)[1].strip()
                return raw.replace("postgresql+asyncpg://", "postgresql://")

    return "postgresql://postgres:postgres@localhost:5432/assessment_db"


# ── Load CUET Plans from pipelines/output ───────────────────────────────────
def load_cuet_output_plans() -> list[dict]:
    output_dir = Path(__file__).parent.parent / "pipelines" / "output"
    if not output_dir.exists():
        print(f"Warning: Output directory does not exist: {output_dir}")
        return []

    plan_files = sorted(output_dir.glob("*_plan.json"))
    if not plan_files:
        print(f"No plan JSON files found in {output_dir}")
        return []

    templates = []
    for filepath in plan_files:
        content = filepath.read_text(encoding="utf-8").strip()
        if not content:
            continue

        # Check for header line: === EXAM | DURATION months | ID: UUID ===
        hdr_match = re.search(r'=== (CUET_\w+) \| (\d+) months \| ID: ([a-f0-9\-]+) ===', content)
        if hdr_match:
            exam = hdr_match.group(1)
            duration_months = int(hdr_match.group(2))
            template_id = hdr_match.group(3)
            json_str = content[hdr_match.end():].strip()
        else:
            filename = filepath.name
            fn_match = re.match(r'^(CUET_\w+)_(\d+)m_plan\.json$', filename)
            if not fn_match:
                print(f"Skipping unrecognized filename pattern: {filename}")
                continue
            exam = fn_match.group(1)
            duration_months = int(fn_match.group(2))
            template_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"{exam}_{duration_months}"))
            json_str = content[content.find('{'):].strip() if '{' in content else content

        # Validate JSON payload
        try:
            plan_obj = json.loads(json_str)
        except json.JSONDecodeError as e:
            print(f"Error parsing JSON in {filepath.name}: {e}")
            continue

        templates.append({
            "id": template_id,
            "exam": exam,
            "duration_months": duration_months,
            "plan": plan_obj,
            "filepath": filepath.name,
        })

    return templates


# ── Seed Script Execution ────────────────────────────────────────────────────
async def seed():
    db_url = _get_db_url()
    print(f"Connecting to database: {db_url}")
    
    try:
        conn = await asyncpg.connect(db_url)
    except Exception as e:
        print(f"Failed to connect to database: {e}")
        return

    templates = load_cuet_output_plans()
    print(f"Found {len(templates)} CUET study plan template files to seed/update.\n")

    inserted_or_updated = 0
    errors = 0

    for t in templates:
        plan_json = json.dumps(t["plan"], ensure_ascii=False)
        try:
            await conn.execute(
                """
                INSERT INTO study_plan_templates (id, exam, duration_months, plan, created_at)
                VALUES ($1::uuid, $2, $3, $4, $5)
                ON CONFLICT (exam, duration_months) DO UPDATE
                SET plan = EXCLUDED.plan,
                    created_at = EXCLUDED.created_at
                """,
                t["id"],
                t["exam"],
                t["duration_months"],
                plan_json,
                datetime.utcnow(),
            )
            print(f"  [SEEDED/UPDATED] {t['exam']} -- {t['duration_months']}m ({t['filepath']}) -> ID: {t['id']}")
            inserted_or_updated += 1
        except Exception as e:
            print(f"  [ERROR] {t['exam']} -- {t['duration_months']}m ({t['filepath']}): {e}")
            errors += 1

    await conn.close()
    print(f"\nSeeding complete. {inserted_or_updated} template(s) processed successfully, {errors} error(s).")


if __name__ == "__main__":
    asyncio.run(seed())
