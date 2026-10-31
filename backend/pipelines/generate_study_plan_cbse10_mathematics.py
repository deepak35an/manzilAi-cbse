"""
Topic-wise study plan generator — CBSE Class 10 Mathematics.

SUBJECT_MATERIAL (topics + subtopics) is built from the PYQ JSON so names and
order match the question bank exactly.

Run from the backend root:
    python pipelines/generate_study_plan_cbse10_mathematics.py
    python pipelines/generate_study_plan_cbse10_mathematics.py --no-upsert
    python pipelines/generate_study_plan_cbse10_mathematics.py --use-gemini
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from topicwise_study_plan_common import (
    BACKEND_ROOT,
    parse_cli_args,
    run_pipeline,
    upsert_flag_from_args,
)

EXAM_KEY = "CBSE_10_MATHEMATICS"
QUESTION_BANK_PATH = (
    BACKEND_ROOT
    / "data"
    / "Examination Content"
    / "CBSE_10"
    / "CBSE_Class10_Mathematics_PYQ.json"
)


async def main() -> None:
    args = parse_cli_args("Generate CBSE Class 10 Mathematics topic-wise study plan")
    await run_pipeline(
        EXAM_KEY,
        QUESTION_BANK_PATH,
        use_gemini=args.use_gemini,
        upsert=upsert_flag_from_args(args),
    )


if __name__ == "__main__":
    asyncio.run(main())
