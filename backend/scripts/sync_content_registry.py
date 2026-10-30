"""
sync_content_registry.py
========================
Scans the `data/` folder (or content storage path) and syncs all question bank JSON files
for CUET, GATE, Subjectwise, and Job-based content into the `content_registry` database table.

Handles duplicate entries by:
1. De-duplicating files in memory during directory scanning.
2. Cleaning up any existing database duplicates before upserting.
3. Using ON CONFLICT (file_path) DO UPDATE to update existing records in-place.

Run whenever new question JSON files are added or updated:
    python scripts/sync_content_registry.py
"""

import asyncio
import os
import json
import uuid
from datetime import datetime
from pathlib import Path

try:
    import asyncpg
except ImportError:
    raise SystemExit("asyncpg not installed. Run: pip install asyncpg")


# ── Config & Helpers ────────────────────────────────────────────────────────
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


ROOT_FOLDER_MAP = {
    "Subjectwise Content": ("subjectwise", "standard"),
    "Examination Content": ("examination", "pyq"),
    "Job Description-Based": ("job", "job"),
}


# ── File Scanner with In-Memory Deduplication ───────────────────────────────
def scan_content_files(base_path: Path) -> list[dict]:
    items_by_path = {}
    if not base_path.exists():
        print(f"Warning: Storage path does not exist: {base_path}")
        return []

    for root, dirs, files in os.walk(base_path):
        for file in files:
            if file.endswith('.json') and not file.startswith('.'):
                full_path = Path(root) / file
                try:
                    rel_path = full_path.relative_to(base_path)
                except ValueError:
                    continue

                parts = rel_path.parts
                if len(parts) < 3:
                    continue

                root_folder_name = parts[0]
                subfolder = parts[1]
                filename = parts[2]

                if root_folder_name not in ROOT_FOLDER_MAP:
                    continue

                root_folder_enum, source_type_enum = ROOT_FOLDER_MAP[root_folder_name]
                db_file_path = "/".join(parts)

                # Read JSON question file
                try:
                    with open(full_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        questions = data if isinstance(data, list) else data.get('questions', [])
                        count = len(questions)

                        # Extract subject metadata if present
                        subject = None
                        if questions and isinstance(questions[0], dict):
                            subject = questions[0].get('subject')
                        if not subject:
                            # Fall back to subject derived from filename or subfolder
                            subject = filename.replace('.json', '').replace('_', ' ')

                except Exception as e:
                    print(f"Error reading {full_path}: {e}")
                    continue

                title = filename.replace('.json', '').replace('_', ' ')

                # Store by normalized file_path key (prevents duplicates in memory)
                items_by_path[db_file_path] = {
                    "file_path": db_file_path,
                    "root_folder": root_folder_enum,
                    "subfolder": subfolder,
                    "title": title,
                    "subject": subject,
                    "source_type": source_type_enum,
                    "question_count": count,
                    "visibility": "global_",
                }


    return list(items_by_path.values())


# ── Database Clean-up & Sync Execution ───────────────────────────────────────
async def sync():
    db_url = _get_db_url()
    # Prefer CONTENT_STORAGE_PATH (Docker mounts host data at /data)
    storage = os.getenv("CONTENT_STORAGE_PATH", "").strip()
    if storage:
        base_path = Path(storage).resolve()
    else:
        base_path = (Path(__file__).parent.parent / "data").resolve()
    print(f"Connecting to database: {db_url}")
    print(f"Scanning content storage path: {base_path}")

    try:
        conn = await asyncpg.connect(db_url)
    except Exception as e:
        print(f"Failed to connect to database: {e}")
        return

    # 1. Clean up any existing duplicate database rows sharing the same file_path
    print("Cleaning up legacy database duplicates if any exist...")
    del_res = await conn.execute(
        """
        DELETE FROM content_registry
        WHERE id NOT IN (
            SELECT DISTINCT ON (file_path) id
            FROM content_registry
            ORDER BY file_path, created_at DESC
        )
        """
    )
    if del_res != "DELETE 0":
        print(f"  [CLEANUP] {del_res} duplicate row(s) removed from content_registry.")

    # 2. Scan content files
    scanned_items = scan_content_files(base_path)
    print(f"Found {len(scanned_items)} unique question bank JSON file(s) across exams and subjects.\n")

    synced_count = 0
    errors = 0

    # 3. Upsert records into content_registry
    for item in scanned_items:
        new_id = str(uuid.uuid4())
        try:
            await conn.execute(
                """
                INSERT INTO content_registry (
                    id, file_path, root_folder, subfolder, title, subject, source_type, question_count, visibility, created_at
                )
                VALUES (
                    $1::uuid, $2, $3::rootfolder, $4, $5, $6, $7::sourcetype, $8, $9::visibility, $10
                )
                ON CONFLICT (file_path) DO UPDATE
                SET subfolder = EXCLUDED.subfolder,
                    title = EXCLUDED.title,
                    subject = EXCLUDED.subject,
                    source_type = EXCLUDED.source_type,
                    question_count = EXCLUDED.question_count,
                    visibility = EXCLUDED.visibility
                """,
                new_id,
                item["file_path"],
                item["root_folder"],
                item["subfolder"],
                item["title"],
                item["subject"],
                item["source_type"],
                item["question_count"],
                item["visibility"],
                datetime.utcnow(),
            )
            print(f"  [SYNCED] {item['root_folder']}/{item['subfolder']} -> {item['title']} ({item['question_count']} questions)")
            synced_count += 1
        except Exception as e:
            print(f"  [ERROR] {item['file_path']}: {e}")
            errors += 1

    await conn.close()
    print(f"\nContent registry sync complete. {synced_count} file(s) synced successfully, {errors} error(s).")


if __name__ == "__main__":
    asyncio.run(sync())
