"""Gemini API client -- used ONLY for question generation, never for grading."""
import json
from typing import List, Optional

import httpx
from app.config import settings
from app.utils.logging import logger

GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"


async def extract_questions_from_text(
    text: str,
    source_type: str = "standard",
    subject: Optional[str] = None,
    num_questions: int = 20,
) -> List[dict]:
    """Extract structured questions from markdown text using Gemini."""
    prompt = f"""You are an expert question bank generator. Extract or generate {num_questions} questions from the following text.

Source type: {source_type}
Subject: {subject or "General"}

Return a JSON array of questions. Each question must have:
- "question_number": sequential integer starting at 1
- "type": one of "MCQ", "MSQ", "NAT", "subjective"
- "subject": the broad subject area
- "topic": the topic within the subject
- "subtopic": a more specific subtopic
- "difficulty": float 0.0 to 1.0
- "question": the question text
- "answer": the correct answer
- "a": first option text (for MCQ/MSQ, null for others)
- "b": second option text (for MCQ/MSQ, null for others)
- "c": third option text (for MCQ, null for others)
- "d": fourth option text (for MCQ, null for others)
- "source_chunk": brief excerpt of the source text used

Text:
{text[:8000]}

Return ONLY the JSON array, no other text."""

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                f"{GEMINI_API_URL}?key={settings.GEMINI_API_KEY}",
                json={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {"temperature": 0.3, "maxOutputTokens": 8192},
                },
            )
            response.raise_for_status()
            data = response.json()
            text_response = data["candidates"][0]["content"]["parts"][0]["text"]
            text_response = text_response.strip()
            if text_response.startswith("```"):
                text_response = text_response.split("\n", 1)[1].rsplit("```", 1)[0]
            return json.loads(text_response)
    except Exception as e:
        logger.error("gemini_extraction_failed", error=str(e))
        return []


async def generate_skill_questions(
    skills: List[str],
    difficulty: str = "medium",
    count: int = 10,
) -> List[dict]:
    """Generate skill-targeted questions for job evaluation."""
    diff_map = {"easy": "0.2-0.4", "medium": "0.4-0.7", "hard": "0.7-1.0"}
    diff_range = diff_map.get(difficulty, "0.4-0.7")

    prompt = f"""Generate {count} assessment questions to evaluate the following skills: {', '.join(skills)}.

Difficulty range: {diff_range}
Distribute questions evenly across skills.

Return a JSON array where each question has:
- "question_number": sequential integer starting at 1
- "type": one of "MCQ", "subjective"
- "subject": "Job Skills"
- "topic": the skill being assessed
- "subtopic": specific aspect of the skill
- "difficulty": float in range {diff_range}
- "question": the question text
- "answer": the correct answer
- "a": first option (for MCQ, null for subjective)
- "b": second option (for MCQ, null for subjective)
- "c": third option (for MCQ, null for subjective)
- "d": fourth option (for MCQ, null for subjective)
- "source_chunk": null

Return ONLY the JSON array."""

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                f"{GEMINI_API_URL}?key={settings.GEMINI_API_KEY}",
                json={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {"temperature": 0.4, "maxOutputTokens": 8192},
                },
            )
            response.raise_for_status()
            data = response.json()
            text_response = data["candidates"][0]["content"]["parts"][0]["text"]
            text_response = text_response.strip()
            if text_response.startswith("```"):
                text_response = text_response.split("\n", 1)[1].rsplit("```", 1)[0]
            return json.loads(text_response)
    except Exception as e:
        logger.error("gemini_skill_questions_failed", error=str(e))
        return []


async def parse_job_description(jd_text: str) -> dict:
    """Extract skills and metadata from a job description using Gemini."""
    prompt = f"""Analyze this job description and extract:
1. A list of required skills
2. The experience level (entry/mid/senior)
3. The role title

Job Description:
{jd_text[:4000]}

Return JSON with keys: "skills" (array of strings), "experience_level" (string), "role_title" (string).
Return ONLY the JSON object."""

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"{GEMINI_API_URL}?key={settings.GEMINI_API_KEY}",
                json={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {"temperature": 0.2, "maxOutputTokens": 2048},
                },
            )
            response.raise_for_status()
            data = response.json()
            text_response = data["candidates"][0]["content"]["parts"][0]["text"]
            text_response = text_response.strip()
            if text_response.startswith("```"):
                text_response = text_response.split("\n", 1)[1].rsplit("```", 1)[0]
            return json.loads(text_response)
    except Exception as e:
        logger.error("gemini_jd_parse_failed", error=str(e))
        return {"skills": [], "experience_level": "unknown", "role_title": "unknown"}


async def generate_study_plan(
    duration_weeks: int,
    topic_table_str: str,
    topic_proficiency: Optional[dict] = None,
) -> str:
    """Generate a study plan using Gemini 2.5 Flash based on duration and topic inventory."""
    from prompt import PLAN_PROMPT, PRIORITY_DATA

    proficiency_note = ""
    if topic_proficiency:
        lines = [f"  - {k}: {v}/5" for k, v in topic_proficiency.items()]
        proficiency_note = (
            "\n\nStudent self-reported topic proficiency (1=beginner, 5=expert):\n"
            + "\n".join(lines)
            + "\nPrioritize weaker topics (rated 1-2) in early weeks. "
            "Distribute stronger topics (4-5) across later weeks as revision."
        )

    prompt = PLAN_PROMPT.format(
        duration=duration_weeks,
        topic_table=topic_table_str + proficiency_note,
        priority_data=PRIORITY_DATA
    )
    logger.info("generating_study_plan_gemini", duration=duration_weeks, prompt_len=len(prompt))

    try:
        async with httpx.AsyncClient(timeout=180.0) as client:
            response = await client.post(
                f"{GEMINI_API_URL}?key={settings.GEMINI_API_KEY}",
                json={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {
                        "temperature": 0.1, 
                        "maxOutputTokens": 16384,
                        "topP": 0.95
                    },
                },
            )
            response.raise_for_status()
            data = response.json()
            
            if "candidates" not in data or not data["candidates"]:
                raise ValueError("No candidates returned from Gemini")
                
            raw_text = data["candidates"][0]["content"]["parts"][0]["text"]
            
            # Attempt to extract JSON block if it exists
            import re
            json_match = re.search(r"(\{[\s\S]*\})", raw_text)
            if json_match:
                return json_match.group(1)
            
            return raw_text
    except Exception as e:
        logger.error("gemini_plan_failed", error=str(e))
        return json.dumps({
            "error": "LLM_GENERATION_FAILED",
            "message": str(e),
            "roadmap": []
        })
