import json
from typing import List, Optional
from pathlib import Path

import aiofiles
import redis.asyncio as aioredis

from app.services.cache_service import get_cached_questions
from app.utils.helpers import resolve_content_path


async def get_questions_for_session(
    content_registry_id: str,
    file_path: str,
    redis: aioredis.Redis,
    topics: Optional[List[str]] = None,
) -> List[dict]:
    """Load questions from cache/filesystem and optionally filter by topic."""
    full_path = str(resolve_content_path(*file_path.split("/")))
    data = await get_cached_questions(content_registry_id, full_path, redis)

    if data is None:
        return []

    if isinstance(data, list):
        questions = data
    else:
        questions = data.get("questions", data) if isinstance(data, dict) else []

    if topics:
        topics_lower = [t.lower() for t in topics]
        questions = [q for q in questions if q.get("topic", "").lower() in topics_lower]

    # Inject source file name (stem only)
    source_file = Path(file_path).stem
    for q in questions:
        q["source_file"] = source_file

    return questions


def get_difficulty_value(q: dict) -> float:
    """Extract numeric difficulty, prioritizing 'b' then 'difficulty'. Handles strings safely."""
    label_map = {"easy": 0.3, "medium": 0.5, "hard": 0.8}
    val = q.get("b", q.get("difficulty", 0.5))
    
    if isinstance(val, str):
        lower_val = val.lower()
        if lower_val in label_map:
            return label_map[lower_val]
        try:
            return float(val)
        except (ValueError, TypeError):
            return 0.5
            
    try:
        return float(val)
    except (ValueError, TypeError):
        return 0.5


def filter_by_difficulty(questions: List[dict], target: float, tolerance: float = 0.2) -> List[dict]:
    """Filter questions within a difficulty range around the target."""
    return [q for q in questions if abs(get_difficulty_value(q) - target) <= tolerance]


def sort_by_difficulty_proximity(questions: List[dict], target: float) -> List[dict]:
    """Sort questions by proximity to target difficulty."""
    return sorted(questions, key=lambda q: abs(get_difficulty_value(q) - target))
async def get_pyq_subtopics(registries: List[dict], redis: aioredis.Redis) -> List[dict]:
    """Aggregate unique subtopics from multiple PYQ registries."""
    all_subtopics = {}

    for reg in registries:
        try:
            full_path = str(resolve_content_path(*reg["file_path"].split("/")))
            data = await get_cached_questions(str(reg["id"]), full_path, redis)
            
            if not data:
                continue
                
            questions = data if isinstance(data, list) else data.get("questions", [])
            
            for q in questions:
                subject = q.get("subject", "General")
                topic = q.get("topic", "General")
                subtopic = q.get("subtopic")
                
                if not subtopic:
                    continue
                    
                if subject not in all_subtopics:
                    all_subtopics[subject] = {}
                if topic not in all_subtopics[subject]:
                    all_subtopics[subject][topic] = set()
                
                all_subtopics[subject][topic].add(subtopic)
        except Exception as e:
            from app.utils.logging import logger
            logger.error("subtopic_aggregation_error", registry_id=reg.get("id"), error=str(e))
            continue

    # Format into a nested list for the frontend
    result = []
    for subj, topics in all_subtopics.items():
        topic_list = []
        for top, subs in topics.items():
            topic_list.append({
                "name": top,
                "subtopics": sorted(list(subs))
            })
        result.append({
            "subject": subj,
            "topics": topic_list
        })
        
    return sorted(result, key=lambda x: x["subject"])


async def get_questions_from_multiple_registries(
    registries: List[dict],
    subtopics: List[str],
    redis: aioredis.Redis
) -> List[dict]:
    """Load and filter questions from multiple files by subtopic."""
    combined_questions = []
    subtopics_lower = [s.lower() for s in subtopics]

    for reg in registries:
        full_path = str(resolve_content_path(*reg["file_path"].split("/")))
        data = await get_cached_questions(str(reg["id"]), full_path, redis)
        
        if not data:
            continue
            
        questions = data if isinstance(data, list) else data.get("questions", [])
        source_name = Path(reg["file_path"]).stem
        
        filtered = []
        for q in questions:
            if (q.get("subtopic") or "").lower() in subtopics_lower:
                q["source_file"] = source_name
                filtered.append(q)
                
        combined_questions.extend(filtered)
        
    return combined_questions


async def match_questions_for_targets(
    targets: List[dict],
    registries: List[dict],
    redis: aioredis.Redis,
) -> List[dict]:
    """
    Given normalised targets (each with subject, topic, subtopics) and a list
    of content registries, load cached questions and return all that match.

    Uses a three-tier matching strategy:
      1. Exact subtopic match
      2. Exact topic + subject match
      3. Fuzzy keyword-in-subtopic match (keywords > 3 chars)

    If none of the above yield results, falls back to broad keyword search
    across all question metadata fields.
    """
    matched: List[dict] = []

    for reg in registries:
        full_path = str(resolve_content_path(*reg["file_path"].split("/")))
        data = await get_cached_questions(str(reg["id"]), full_path, redis)
        if not data:
            continue
        questions = data if isinstance(data, list) else data.get("questions", [])
        source_name = Path(reg["file_path"]).stem

        for q in questions:
            q_subject = (q.get("subject") or "").lower().strip()
            q_topic = (q.get("topic") or "").lower().strip()
            q_subtopic = (q.get("subtopic") or "").lower().strip()

            is_match = False
            for target in targets:
                if q_subtopic and q_subtopic in target["subtopics"]:
                    is_match = True
                    break
                if q_topic == target["topic"] and q_subject == target["subject"]:
                    is_match = True
                    break
                if any(kw in q_subtopic for kw in target["subtopics"] if len(kw) > 3):
                    is_match = True
                    break

            if is_match:
                q["source_file"] = source_name
                matched.append(q)

    # Fallback: broader keyword match if strict matching found nothing
    if not matched:
        all_keywords: List[str] = []
        for t in targets:
            all_keywords.extend(t["subtopics"])
            all_keywords.append(t["topic"])

        for reg in registries:
            full_path = str(resolve_content_path(*reg["file_path"].split("/")))
            data = await get_cached_questions(str(reg["id"]), full_path, redis)
            if not data:
                continue
            questions = data if isinstance(data, list) else data.get("questions", [])
            source_name = Path(reg["file_path"]).stem
            for q in questions:
                text = (
                    str(q.get("subject", "")) + " "
                    + str(q.get("topic", "")) + " "
                    + str(q.get("subtopic", ""))
                ).lower()
                if any(kw in text for kw in all_keywords if len(kw) > 3):
                    q["source_file"] = source_name
                    matched.append(q)

    return matched
