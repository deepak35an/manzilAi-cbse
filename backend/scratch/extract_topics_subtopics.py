import json
from pathlib import Path

# Paths
seed_file = Path("scripts/seed_study_plans.py")

def main():
    if not seed_file.exists():
        # Fallback if scripts directory is nested differently
        print("seed_study_plans.py not found in scripts/!")
        return

    # Import seed_study_plans dynamically or read and parse it.
    # Since we have the file on disk, let's load the JSON definitions by importing it.
    import sys
    sys.path.append(str(Path(".").resolve()))
    
    from scripts.seed_study_plans import TEMPLATES

    hierarchy = {}

    for t in TEMPLATES:
        plan = t["plan"]
        roadmap = plan.get("roadmap", [])
        for wk in roadmap:
            for s in wk.get("subjects", []):
                subject = s.get("subject", "").strip()
                topic = s.get("topic", "").strip()
                subtopics = s.get("subtopics", [])

                if not subject or not topic:
                    continue

                if subject not in hierarchy:
                    hierarchy[subject] = {}
                if topic not in hierarchy[subject]:
                    hierarchy[subject][topic] = set()

                for sub in subtopics:
                    sub_clean = sub.strip()
                    if sub_clean:
                        hierarchy[subject][topic].add(sub_clean)

    # Convert sets to sorted lists for clean JSON export
    cleaned_hierarchy = {}
    for subject in sorted(hierarchy.keys()):
        cleaned_hierarchy[subject] = {}
        for topic in sorted(hierarchy[subject].keys()):
            cleaned_hierarchy[subject][topic] = sorted(list(hierarchy[subject][topic]))

    # Save to JSON
    out_json = Path("scratch/extracted_topics.json")
    out_json.parent.mkdir(exist_ok=True)
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(cleaned_hierarchy, f, indent=2, ensure_ascii=False)

    # Save to Markdown for easier reading
    out_md = Path("scratch/extracted_topics.md")
    with open(out_md, "w", encoding="utf-8") as f:
        f.write("# Extracted Subjects, Topics, and Subtopics\n\n")
        f.write("Extracted hierarchically from the 3 study plan templates (3, 6, and 12-month plans).\n\n")
        for subj, topics in sorted(cleaned_hierarchy.items()):
            f.write(f"## {subj}\n")
            for top, subs in sorted(topics.items()):
                f.write(f"- **{top}**\n")
                for sub in subs:
                    f.write(f"  - {sub}\n")
            f.write("\n")

    print(f"Extraction complete! Saved to:")
    print(f"  - JSON: scratch/extracted_topics.json")
    print(f"  - Markdown: scratch/extracted_topics.md")

if __name__ == "__main__":
    main()
