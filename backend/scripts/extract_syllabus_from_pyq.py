"""
extract_syllabus_from_pyq.py
=============================
Extracts topic and subtopic hierarchies from PYQ question paper JSON files.

Features:
1. Supports single-subject papers (e.g. CUET: CUET_Chemistry.json, CUET_Physics.json).
2. Supports multi-subject combined papers (e.g. GATE: GATE_2024.json, GATE_2025.json),
   automatically merging questions across papers by subject.
3. Incremental processing: Tracks processed files using MD5 hashes in `syllabus_manifest.json`.
   Subsequent runs skip already processed files unless modified or forced.
4. Outputs structured syllabus JSON files to `backend/data/syllabus/<subfolder>_syllabus.json`.

Usage:
    python scripts/extract_syllabus_from_pyq.py --folder GATE_CSE_PYQ
    python scripts/extract_syllabus_from_pyq.py --folder CUET_PYQ
    python scripts/extract_syllabus_from_pyq.py --all
    python scripts/extract_syllabus_from_pyq.py --all --force
"""

import argparse
import hashlib
import json
import os
import sys
from datetime import datetime
from pathlib import Path

# Paths
SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_ROOT = SCRIPT_DIR.parent
DATA_DIR = BACKEND_ROOT / "data"
EXAM_CONTENT_DIR = DATA_DIR / "Examination Content"
SYLLABUS_DIR = DATA_DIR / "syllabus"
MANIFEST_FILE = SYLLABUS_DIR / "syllabus_manifest.json"


def get_file_md5(file_path: Path) -> str:
    """Calculate MD5 hash of a file for incremental processing check."""
    hasher = hashlib.md5()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def load_manifest() -> dict:
    """Load or initialize the syllabus manifest tracking processed files."""
    if MANIFEST_FILE.exists():
        try:
            with open(MANIFEST_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"Warning: Failed to read manifest file: {e}. Re-initializing.")
    return {"version": "1.0", "processed_files": {}, "last_updated": ""}


def save_manifest(manifest: dict) -> None:
    """Save the syllabus manifest."""
    SYLLABUS_DIR.mkdir(parents=True, exist_ok=True)
    manifest["last_updated"] = datetime.utcnow().isoformat() + "Z"
    with open(MANIFEST_FILE, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)


def process_subfolder(subfolder_path: Path, manifest: dict, force: bool = False) -> dict:
    """Processes all question paper JSON files in a subfolder and builds the extracted syllabus.

    Handles merging for multi-subject papers (e.g. GATE) and subject isolation for single-subject papers (CUET).
    """
    subfolder_name = subfolder_path.name
    print(f"\n==================================================")
    print(f" Processing Subfolder: {subfolder_name}")
    print(f" Path: {subfolder_path}")
    print(f"==================================================")

    output_file = SYLLABUS_DIR / f"{subfolder_name}_syllabus.json"
    existing_syllabus = {}
    if output_file.exists() and not force:
        try:
            with open(output_file, "r", encoding="utf-8") as f:
                existing_syllabus = json.load(f)
        except Exception:
            existing_syllabus = {}

    json_files = sorted(subfolder_path.glob("*.json"))
    if not json_files:
        print(f"No JSON paper files found in {subfolder_path}")
        return {}

    # Target syllabus structure
    # {
    #   "exam_folder": "GATE_CSE_PYQ",
    #   "last_processed_at": "...",
    #   "processed_files": [...],
    #   "subjects": {
    #       "Databases": {
    #           "total_questions": 120,
    #           "topics": {
    #               "Transactions and Concurrency Control": {
    #                   "question_count": 30,
    #                   "subtopics": {"ACID Properties": 15, "2PL": 15},
    #                   "source_papers": ["GATE_2024.json"]
    #               }
    #           }
    #       }
    #   }
    # }

    # Load existing subjects map if updating incrementally
    raw_subjects_data = existing_syllabus.get("subjects_data", {})
    subjects_data = {}
    for s_name, s_data in raw_subjects_data.items():
        subjects_data[s_name] = {
            "subject": s_data.get("subject", s_name),
            "total_questions": s_data.get("total_questions", 0),
            "topics": {},
        }
        for t_name, t_data in s_data.get("topics", {}).items():
            subjects_data[s_name]["topics"][t_name] = {
                "topic": t_data.get("topic", t_name),
                "question_count": t_data.get("question_count", 0),
                "subtopics": t_data.get("subtopics", {}),
                "source_papers": set(t_data.get("source_papers", [])),
            }

    processed_papers = existing_syllabus.get("processed_papers", [])

    files_processed_count = 0
    files_skipped_count = 0
    total_questions_parsed = 0

    for file_path in json_files:
        rel_key = f"{subfolder_name}/{file_path.name}"
        current_md5 = get_file_md5(file_path)

        # Check if already processed
        if not force and rel_key in manifest["processed_files"]:
            file_meta = manifest["processed_files"][rel_key]
            if file_meta.get("md5") == current_md5:
                print(f"  [SKIPPED] {file_path.name} (already processed & unchanged)")
                files_skipped_count += 1
                continue

        print(f"  [PARSING] {file_path.name} ...")
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                raw = json.load(f)
                questions = raw if isinstance(raw, list) else raw.get("questions", [])

            # Derive default subject from filename if question subject is missing
            default_subject = file_path.stem.replace("CUET_", "").replace("GATE_", "").replace("_", " ").title()

            paper_q_count = 0
            for q in questions:
                if not isinstance(q, dict):
                    continue

                subj_name = (q.get("subject") or default_subject or "General").strip()
                topic_name = (q.get("topic") or "General Topics").strip()
                subtopic_name = (q.get("subtopic") or "General Subtopics").strip()

                if subj_name not in subjects_data:
                    subjects_data[subj_name] = {
                        "subject": subj_name,
                        "total_questions": 0,
                        "topics": {},
                    }

                subj_obj = subjects_data[subj_name]
                subj_obj["total_questions"] += 1

                if topic_name not in subj_obj["topics"]:
                    subj_obj["topics"][topic_name] = {
                        "topic": topic_name,
                        "question_count": 0,
                        "subtopics": {},
                        "source_papers": set(),
                    }

                top_obj = subj_obj["topics"][topic_name]
                top_obj["question_count"] += 1
                top_obj["source_papers"].add(file_path.name)

                if subtopic_name not in top_obj["subtopics"]:
                    top_obj["subtopics"][subtopic_name] = 0
                top_obj["subtopics"][subtopic_name] += 1

                paper_q_count += 1
                total_questions_parsed += 1

            # Mark file as processed in manifest
            manifest["processed_files"][rel_key] = {
                "md5": current_md5,
                "processed_at": datetime.utcnow().isoformat() + "Z",
                "question_count": paper_q_count,
            }
            if file_path.name not in processed_papers:
                processed_papers.append(file_path.name)

            files_processed_count += 1
            print(f"    -> Extracted {paper_q_count} questions across subjects")

        except Exception as e:
            print(f"  [ERROR] Failed to process {file_path.name}: {e}")

    # Build JSON-serializable subjects_data dictionary
    serializable_subjects_data = {}
    formatted_subjects = []
    for subj_name, subj_info in sorted(subjects_data.items()):
        formatted_topics = []
        ser_topics = {}
        for top_name, top_info in sorted(subj_info["topics"].items()):
            subtopic_list = [
                {"name": st_name, "count": st_cnt}
                for st_name, st_cnt in sorted(top_info["subtopics"].items())
            ]
            source_list = sorted(list(top_info["source_papers"]))
            formatted_topics.append({
                "topic": top_info["topic"],
                "question_count": top_info["question_count"],
                "subtopics": subtopic_list,
                "source_papers": source_list,
            })
            ser_topics[top_name] = {
                "topic": top_info["topic"],
                "question_count": top_info["question_count"],
                "subtopics": top_info["subtopics"],
                "source_papers": source_list,
            }

        formatted_subjects.append({
            "subject": subj_name,
            "total_questions": subj_info["total_questions"],
            "total_topics": len(formatted_topics),
            "topics": formatted_topics,
        })
        serializable_subjects_data[subj_name] = {
            "subject": subj_name,
            "total_questions": subj_info["total_questions"],
            "topics": ser_topics,
        }

    syllabus_payload = {
        "exam_folder": subfolder_name,
        "last_updated": datetime.utcnow().isoformat() + "Z",
        "processed_files_count": len(processed_papers),
        "processed_papers": sorted(processed_papers),
        "total_subjects": len(formatted_subjects),
        "subjects": formatted_subjects,
        "subjects_data": serializable_subjects_data,  # Preserved for incremental merge re-runs
    }

    # Save to syllabus directory
    SYLLABUS_DIR.mkdir(parents=True, exist_ok=True)
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(syllabus_payload, f, indent=2, ensure_ascii=False)

    save_manifest(manifest)

    print(f"\nCompleted {subfolder_name}:")
    print(f"  Files Processed : {files_processed_count}")
    print(f"  Files Skipped   : {files_skipped_count}")
    print(f"  Subjects Found  : {len(formatted_subjects)}")
    print(f"  Syllabus File   : {output_file}")

    return syllabus_payload


def main():
    parser = argparse.ArgumentParser(description="Extract topics and subtopics from PYQ question papers.")
    parser.add_argument("--folder", type=str, help="Subfolder name inside backend/data/Examination Content (e.g. GATE_CSE_PYQ or CUET_PYQ)")
    parser.add_argument("--all", action="store_true", help="Process all subfolders inside Examination Content")
    parser.add_argument("--force", action="store_true", help="Force re-processing of all files, ignoring manifest cache")

    args = parser.parse_args()

    if not args.folder and not args.all:
        parser.print_help()
        print("\nExample commands:")
        print("  python scripts/extract_syllabus_from_pyq.py --folder GATE_CSE_PYQ")
        print("  python scripts/extract_syllabus_from_pyq.py --folder CUET_PYQ")
        print("  python scripts/extract_syllabus_from_pyq.py --all")
        sys.exit(1)

    manifest = load_manifest()

    if args.all:
        if not EXAM_CONTENT_DIR.exists():
            print(f"Error: Directory not found: {EXAM_CONTENT_DIR}")
            sys.exit(1)

        subfolders = [p for p in EXAM_CONTENT_DIR.iterdir() if p.is_dir()]
        print(f"Found {len(subfolders)} exam subfolders to process.")
        for sf in subfolders:
            process_subfolder(sf, manifest, force=args.force)

    elif args.folder:
        target_path = EXAM_CONTENT_DIR / args.folder
        if not target_path.exists():
            # Check if direct path passed
            target_path = Path(args.folder)
            if not target_path.exists():
                print(f"Error: Subfolder not found: {EXAM_CONTENT_DIR / args.folder}")
                sys.exit(1)

        process_subfolder(target_path, manifest, force=args.force)

    print("\nAll done!")


if __name__ == "__main__":
    main()
