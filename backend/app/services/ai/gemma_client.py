"""Gemma (Ollama) client -- used ONLY for grading and summaries, never for generation."""
import asyncio
import json
import os
import subprocess
import sys
from typing import List, Optional

import httpx
from app.config import settings
from app.utils.logging import logger

OLLAMA_GENERATE_URL = f"{settings.OLLAMA_BASE_URL}/api/generate"
OLLAMA_HEALTH_URL = f"{settings.OLLAMA_BASE_URL}/api/tags"
MODEL_NAME = "gemma3:4b"


async def _is_ollama_running() -> bool:
    """Check whether the Ollama server is reachable."""
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            r = await client.get(OLLAMA_HEALTH_URL)
            return r.status_code == 200
    except Exception:
        return False


async def _ensure_ollama_running() -> bool:
    """
    If Ollama is not running, try to start it with `ollama serve`.
    Waits up to 15 seconds for it to become healthy.
    Returns True if Ollama is healthy after the attempt.
    """
    if await _is_ollama_running():
        return True

    if os.getenv("OLLAMA_AUTO_START", "true").lower() == "false":
        logger.warning("ollama_not_running__auto_start_disabled")
        return False

    logger.warning("ollama_not_running__attempting_start")
    try:
        # Launch `ollama serve` as a detached background process.
        # On Windows we use CREATE_NEW_PROCESS_GROUP so it doesn't
        # die when the parent process exits.
        kwargs = {}
        if sys.platform == "win32":
            kwargs["creationflags"] = (
                subprocess.CREATE_NEW_PROCESS_GROUP
                | subprocess.DETACHED_PROCESS
            )
        else:
            kwargs["start_new_session"] = True

        subprocess.Popen(
            ["ollama", "serve"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            **kwargs,
        )
        logger.info("ollama_serve_launched")
    except FileNotFoundError:
        logger.error("ollama_binary_not_found__install_ollama")
        return False
    except Exception as exc:
        logger.error("ollama_start_failed", error=str(exc))
        return False

    # Poll until healthy (up to 15 s)
    for attempt in range(15):
        await asyncio.sleep(1)
        if await _is_ollama_running():
            logger.info("ollama_started_successfully", waited_seconds=attempt + 1)
            return True

    logger.error("ollama_did_not_start_in_time")
    return False


async def _call_ollama(prompt: str, use_json_format: bool = False, timeout: float = 60.0) -> dict:
    """
    Core Ollama call with one auto-start retry.
    Returns the raw JSON response dict from Ollama.
    Raises httpx.HTTPError or RuntimeError on failure.
    """
    payload: dict = {
        "model": MODEL_NAME,
        "prompt": prompt,
        "stream": False,
    }
    if use_json_format:
        payload["format"] = "json"

    for attempt in (1, 2):          # attempt 1: normal; attempt 2: after auto-start
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(OLLAMA_GENERATE_URL, json=payload)
                response.raise_for_status()
                return response.json()
        except (httpx.ConnectError, httpx.TimeoutException) as exc:
            if attempt == 1:
                logger.warning(
                    "ollama_unreachable__trying_to_start",
                    exc_type=type(exc).__name__,
                    error=str(exc) or repr(exc),
                )
                started = await _ensure_ollama_running()
                if not started:
                    raise RuntimeError("Ollama could not be started automatically.") from exc
                # loop continues for attempt 2
            else:
                raise


async def generate_grading(
    question_text: str,
    correct_answer: str,
    student_answer: str,
    difficulty: float = 0.5,
    mode: str = "standard",
) -> dict:
    """Grade a student answer using Gemma via Ollama."""
    if mode == "pyq":
        prompt = f"""You are an expert exam grader for competitive exams like GATE.
Grade the following answer according to strict marking rules:
- MCQs: +10 for exactly correct answer, -2.5 for incorrect answer, no partial marking here.
- MSQs (Selective Marking):
    * +10 marks if ALL correct options are selected and NO incorrect ones are selected.
    * +5 marks if any subset of correct options is selected and NO incorrect ones are selected.
    * -2.5 marks if ANY incorrect option is selected, regardless of how many correct ones are selected.
- Do not provide extra marks in case of multiple options being correct.
- The max marks a question can carry is 10 only do not exceed that    
- NAT/Other: +10 for correct, 0 for incorrect.

Question: {question_text}
Correct Answer: {correct_answer}
Student Answer: {student_answer}

Return JSON with keys: "score" (float), "explanation" (brief internal reasoning).
Return ONLY the JSON object."""
    else:
        prompt = f"""
You are a STRICT exam grader. Your goal is to assign fair and consistent marks.

Question: {question_text}
Correct Answer: {correct_answer}
Student Answer: {student_answer}
Difficulty: {difficulty}

GRADING RULES (MANDATORY)

STEP 1: RELEVANCE CHECK (HARD FILTER)
- If the student answer is completely unrelated to the question, assign:
  score = 0
  explanation = "Answer is irrelevant to the question."
- If the answer is partially related, continue to STEP 2.

STEP 2: CONTENT EVALUATION (ONLY IF RELEVANT)
Evaluate based on:
1. Accuracy (MOST IMPORTANT)
2. Completeness
3. Depth of understanding

SCORING GUIDELINES:
- 9–10: Fully correct, complete, and well-explained
- 7–8: Mostly correct, minor gaps
- 5–6: Partially correct, key concepts missing
- 3–4: Weak understanding, major errors
- 1–2: Barely relevant, mostly incorrect
- 0: Completely incorrect OR irrelevant

IMPORTANT CONSTRAINTS:
- DO NOT give marks for unrelated content
- DO NOT assume missing information
- DO NOT hallucinate correctness
- Be strict and conservative in marking

OUTPUT FORMAT (STRICT JSON ONLY):
{{
  "score": float (0-10),
  "explanation": "Brief justification focusing on relevance and correctness"
}}
"""
    try:
        data = await _call_ollama(prompt, use_json_format=True)
        result = json.loads(data.get("response", "{}"))
        score = float(result.get("score", 0))
        return {"score": score, "explanation": ""}
    except Exception as e:
        logger.error("gemma_grading_failed", error=str(e))
        return {"score": 0.0, "explanation": ""}


async def generate_summary(
    responses: List[dict],
    theta_final: float,
    mode: str,
) -> str:
    """Generate a performance summary using Gemma via Ollama.

    Uses a 180-second timeout because generating 3-4 paragraphs with
    gemma3:4b can take up to 2 minutes on CPU.
    If Ollama is not running it will be started automatically before the call.
    """
    response_summary = []
    for r in responses[:50]:
        response_summary.append({
            "question": r.get("question_text", "")[:100],
            "score": r.get("score", 0),
            "topic": r.get("topic", ""),
        })

    prompt = f"""
You are an expert educational assessment analyst and psychometric evaluation specialist.
Your task is to generate a professional student performance report based ONLY on the provided assessment data. Do not invent or assume information that is not supported by the responses.

Assessment Information
----------------------
Assessment Mode: {mode}
Final Ability Index (Theta): {theta_final:.2f}
Interpretation:
- Higher theta = higher estimated proficiency.
- Base all conclusions on the response data.

Question Performance:
{json.dumps(response_summary, indent=2)}

Instructions
------------
Write a polished assessment report using the EXACT structure below. Use clear section headers and bullet points under each section. Do not write flowing paragraphs.

## Overall Performance
- 2-3 bullet points giving an objective summary of overall performance.
- Interpret the ability index (theta) in plain terms.
- Comment on consistency and confidence based on the response pattern.

## Strengths
- List each strong topic/concept as its own bullet point.
- For each, briefly note the pattern observed (e.g., consistently correct) and what it indicates about understanding.
- Only include topics with a genuine pattern of correct responses.

## Areas Requiring Improvement (Highest Priority)
- List each weak topic as its own bullet point, in priority order (most mistakes first).
- For each topic, briefly explain why it needs attention (e.g., number/pattern of incorrect responses).
- Never list a topic as both a strength and a weakness.

## Personalized Recommendations
- One bullet point per weak topic, formatted as: **Topic** – specific learning strategy + practice approach.
- End with a single-line motivational closing statement as its own bullet.

Writing Style
-------------
- Professional and analytical, like reports from educational testing platforms.
- Objective, evidence-based, and concise.
- Use bullet points under each header — do NOT use paragraph form.
- Keep bullets short (1-2 sentences each).
- Avoid repeating the same idea across sections.
- Avoid generic advice such as "practice more" — always tie advice to specific topics.
- Reference specific topics/concepts from the data whenever possible.
- Keep the entire report between 200 and 320 words.
- Use "##" for section headers exactly as shown above.

Return plain text only (markdown headers and bullets are fine, no other formatting).
""" 
    try:
        # 180s timeout — gemma3:4b on CPU can take ~90-120s for a full summary
        data = await _call_ollama(prompt, use_json_format=False, timeout=180.0)
        summary = data.get("response", "").strip()
        if not summary:
            return "Summary generation failed — Gemma returned an empty response."
        logger.info("gemma_summary_generated", length=len(summary))
        return summary
    except Exception as e:
        logger.error(
            "gemma_summary_failed",
            exc_type=type(e).__name__,
            error=str(e) or repr(e),
        )
        return f"Unable to generate summary at this time. (Reason: {type(e).__name__}: {e or repr(e)})"


async def generate_performance_report(
    strengths: list[dict],
    weaknesses: list[dict],
) -> str:
    """Generate an AI prose report on strengths and areas for improvement."""
    prompt = f"""
You are an experienced educational coach specializing in personalized learning and student development.
Your task is to write a professional, encouraging, and evidence-based feedback report using ONLY the information provided below.

Student Performance Summary
---------------------------
Top Strengths:
{json.dumps(strengths[:5], indent=2)}

Areas Needing Improvement:
{json.dumps(weaknesses[:5], indent=2)}

Instructions
------------
Write a well-structured report using the EXACT structure below. Use clear section headers and bullet points under each section. Do not write flowing paragraphs or narrative prose.

## Overall Reflection
- 1-2 bullet points giving a positive, balanced overview of the student's performance.
- Acknowledge that the assessment reveals both strengths and opportunities for growth.

## Strengths
- List each strong topic as its own bullet point.
- For each, briefly note what it indicates about the student's understanding.

## Growth Opportunities
- List each weak topic as its own bullet point.
- For each, briefly explain how improving it will strengthen overall performance.
- Do not repeat topics already listed under Strengths.

## Personalized Learning Advice
- One bullet point per weak topic, formatted as: **Topic** – specific strategy (e.g., spaced repetition, targeted practice, progressively harder questions, reviewing mistakes, concept revision).
- End with a single-line motivating closing statement as its own bullet.

Writing Style
-------------
- Professional, supportive, and constructive — like feedback from modern adaptive learning platforms.
- Use bullet points under each header — do NOT use paragraph form.
- Keep bullets short (1-2 sentences each).
- Avoid exaggerated praise.
- Avoid clichés such as "keep up the good work" or "practice makes perfect."
- Avoid repeating the same ideas across sections.
- Mention the actual topic names where appropriate.
- Keep the entire report between 160 and 250 words.
- Use "##" for section headers exactly as shown above.

Return plain text only .
"""

    try:
        data = await _call_ollama(prompt, use_json_format=False, timeout=120.0)
        report = data.get("response", "").strip()
        return report or "Performance report generation failed."
    except Exception as e:
        logger.error("gemma_performance_report_failed", error=str(e))
        return f"Unable to generate performance report at this time. ({type(e).__name__})"
