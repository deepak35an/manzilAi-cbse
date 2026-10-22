import json
import hashlib
import uuid
from pathlib import Path
from typing import List, Optional

import aiofiles
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload
from fastapi import HTTPException


from app.config import settings
from app.models.content_registry import ContentRegistry, ContentAccess, RootFolder, Visibility, SourceType
from app.utils.helpers import resolve_content_path
from app.utils.logging import logger

ROOT_FOLDER_MAP = {
    "Subjectwise Content": RootFolder.subjectwise,
    "Examination Content": RootFolder.examination,
    "Job Description-Based": RootFolder.job,
}

REVERSE_ROOT_MAP = {v.value: k for k, v in ROOT_FOLDER_MAP.items()}


def validate_root_folder(name: str) -> str:
    if name not in settings.FIXED_ROOT_FOLDERS:
        raise HTTPException(status_code=400, detail=f"Invalid root folder. Must be one of: {settings.FIXED_ROOT_FOLDERS}")
    return name


async def create_subfolder(root_folder: str, subfolder_name: str) -> dict:
    validate_root_folder(root_folder)
    path = resolve_content_path(root_folder, subfolder_name)
    if path.exists():
        raise HTTPException(status_code=409, detail="Subfolder already exists")
    path.mkdir(parents=True, exist_ok=True)
    logger.info("subfolder_created", root=root_folder, subfolder=subfolder_name)
    return {"message": "Subfolder created", "path": str(path)}


async def delete_subfolder(root_folder: str, subfolder_name: str, db: AsyncSession) -> dict:
    validate_root_folder(root_folder)
    path = resolve_content_path(root_folder, subfolder_name)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Subfolder not found")

    root_enum = ROOT_FOLDER_MAP[root_folder]
    
    # 1. Find all content IDs in this subfolder
    result = await db.execute(
        select(ContentRegistry.id).where(
            ContentRegistry.root_folder == root_enum,
            ContentRegistry.subfolder == subfolder_name,
        )
    )
    content_ids = result.scalars().all()

    if content_ids:
        # 2. Nullify references in quiz_sessions so deletion isn't blocked
        from app.models.quiz import QuizSession
        from sqlalchemy import update
        await db.execute(
            update(QuizSession)
            .where(QuizSession.content_registry_id.in_(content_ids))
            .values(content_registry_id=None)
        )

        # 3. Delete from registry (cascades to content_access)
        await db.execute(
            delete(ContentRegistry).where(ContentRegistry.id.in_(content_ids))
        )

    # 4. Remove from disk
    import shutil
    shutil.rmtree(path)
    logger.info("subfolder_deleted", root=root_folder, subfolder=subfolder_name)
    return {"message": "Subfolder deleted"}


async def upload_question_bank(
    root_folder: str,
    subfolder: str,
    filename: str,
    content: bytes,
    user_id: str,
    db: AsyncSession,
) -> ContentRegistry:
    validate_root_folder(root_folder)
    data = json.loads(content)

    if isinstance(data, dict) and "questions" in data:
        questions = data["questions"]
    elif isinstance(data, list):
        questions = data
    else:
        raise HTTPException(status_code=400, detail="JSON must be a list of question dicts or contain a 'questions' key")

    if not questions:
        raise HTTPException(status_code=400, detail="Question list is empty")

    REQUIRED_FIELDS = {"type", "answer"}
    
    for i, q in enumerate(questions):
        # Support 'text' as an alias for 'question'
        if "text" in q and "question" not in q:
            q["question"] = q.pop("text")
        
        # Ensure question field exists
        if "question" not in q:
            raise HTTPException(status_code=400, detail=f"Question at index {i} is missing the 'question' or 'text' field")

        # Heuristic for missing 'type'
        if "type" not in q:
            if "options" in q and q["options"]:
                q["type"] = "MCQ"
            elif root_folder == "Subjectwise Content":
                q["type"] = "subjective"
            else:
                ans = str(q.get("answer", ""))
                try:
                    float(ans)
                    q["type"] = "NAT"
                except ValueError:
                    q["type"] = "subjective"
        else:
            # Ensure the type is lowercase 'subjective' if provided as capitalized
            if q["type"].lower() == "subjective":
                q["type"] = "subjective"

        # Ensure answer field exists
        if "answer" not in q:
             raise HTTPException(status_code=400, detail=f"Question at index {i} is missing the 'answer' field")

    subfolder_path = resolve_content_path(root_folder, subfolder)
    subfolder_path.mkdir(parents=True, exist_ok=True)

    file_path = str(subfolder_path / filename)

    async with aiofiles.open(file_path, "wb") as f:
        await f.write(content)

    root_enum = ROOT_FOLDER_MAP[root_folder]
    first_q = questions[0] if questions else {}

    inferred_source_type = SourceType.standard
    if root_enum == RootFolder.examination:
        inferred_source_type = SourceType.pyq
    elif root_enum == RootFolder.job:
        inferred_source_type = SourceType.job

    # Check if subfolder has established visibility settings from existing files
    existing_file_stmt = select(ContentRegistry).options(
        selectinload(ContentRegistry.access_list)
    ).where(
        ContentRegistry.root_folder == root_enum,
        ContentRegistry.subfolder == subfolder,
    )
    res_existing = await db.execute(existing_file_stmt)
    existing_reg = res_existing.scalars().first()

    inherited_visibility = Visibility.global_
    inherited_org_ids = []
    if existing_reg:
        inherited_visibility = existing_reg.visibility
        inherited_org_ids = [str(ca.org_id) for ca in existing_reg.access_list]

    registry = ContentRegistry(
        id=uuid.uuid4(),
        file_path=file_path,
        root_folder=root_enum,
        subfolder=subfolder,
        title=filename.replace(".json", ""),
        subject=first_q.get("subject"),
        source_type=inferred_source_type,
        question_count=len(questions),
        visibility=inherited_visibility,
        created_by=uuid.UUID(user_id),
    )
    db.add(registry)
    await db.flush()

    if inherited_visibility == Visibility.org_specific and inherited_org_ids:
        for oid in inherited_org_ids:
            db.add(ContentAccess(
                id=uuid.uuid4(),
                content_registry_id=registry.id,
                org_id=uuid.UUID(oid),
            ))
        await db.flush()

    logger.info("question_bank_uploaded", file_path=file_path, questions=registry.question_count, source_type=inferred_source_type)
    return registry


async def set_visibility(
    registry_id: str,
    visibility: str,
    org_ids: Optional[List[str]],
    db: AsyncSession,
) -> dict:
    result = await db.execute(select(ContentRegistry).where(ContentRegistry.id == uuid.UUID(registry_id)))
    registry = result.scalar_one_or_none()
    if not registry:
        raise HTTPException(status_code=404, detail="Content not found")

    registry.visibility = Visibility(visibility)

    await db.execute(delete(ContentAccess).where(ContentAccess.content_registry_id == registry.id))

    if visibility == "org_specific" and org_ids:
        for oid in org_ids:
            db.add(ContentAccess(
                id=uuid.uuid4(),
                content_registry_id=registry.id,
                org_id=uuid.UUID(oid),
            ))

    await db.flush()
    return {"message": "Visibility updated", "visibility": visibility}


async def set_subfolder_visibility(
    root_folder: str,
    subfolder: str,
    visibility: str,
    org_ids: Optional[List[str]],
    db: AsyncSession,
) -> dict:
    root_enum = ROOT_FOLDER_MAP.get(root_folder)
    if not root_enum:
        raise HTTPException(status_code=400, detail="Invalid root folder")

    result = await db.execute(
        select(ContentRegistry).where(
            ContentRegistry.root_folder == root_enum,
            ContentRegistry.subfolder == subfolder,
        )
    )
    registries = result.scalars().all()

    new_vis = Visibility(visibility)

    for reg in registries:
        reg.visibility = new_vis
        await db.execute(delete(ContentAccess).where(ContentAccess.content_registry_id == reg.id))
        if visibility == "org_specific" and org_ids:
            for oid in org_ids:
                db.add(ContentAccess(
                    id=uuid.uuid4(),
                    content_registry_id=reg.id,
                    org_id=uuid.UUID(oid),
                ))

    await db.flush()
    return {
        "message": f"Visibility updated for subfolder '{subfolder}'",
        "visibility": visibility,
        "org_ids": org_ids or [],
        "updated_count": len(registries),
    }


async def get_content_tree(db: AsyncSession) -> List[dict]:
    base = Path(settings.CONTENT_STORAGE_PATH).resolve()
    tree = []

    for root_name in settings.FIXED_ROOT_FOLDERS:
        root_path = base / root_name
        subfolders = []
        if root_path.exists():
            subfolders = sorted([d.name for d in root_path.iterdir() if d.is_dir()])

        root_enum = ROOT_FOLDER_MAP[root_name]
        result = await db.execute(
            select(ContentRegistry)
            .options(selectinload(ContentRegistry.access_list))
            .where(ContentRegistry.root_folder == root_enum)
        )
        files = result.scalars().all()

        files_by_subfolder: dict[str, dict] = {}
        file_list = []

        for f in files:
            org_ids = [str(ca.org_id) for ca in f.access_list]
            file_list.append({
                "id": str(f.id),
                "file_path": f.file_path,
                "root_folder": f.root_folder.value,
                "subfolder": f.subfolder,
                "title": f.title,
                "subject": f.subject,
                "source_type": f.source_type.value,
                "question_count": f.question_count,
                "visibility": f.visibility.value,
                "org_ids": org_ids,
                "created_at": f.created_at.isoformat(),
            })

            if f.subfolder not in files_by_subfolder:
                files_by_subfolder[f.subfolder] = {
                    "visibility": f.visibility.value,
                    "org_ids": org_ids,
                }

        subfolder_details = []
        for sf in subfolders:
            sf_info = files_by_subfolder.get(sf, {"visibility": "global", "org_ids": []})
            subfolder_details.append({
                "name": sf,
                "visibility": sf_info["visibility"],
                "org_ids": sf_info["org_ids"],
            })

        tree.append({
            "root_folder": root_name,
            "subfolders": subfolders,
            "subfolder_details": subfolder_details,
            "files": file_list,
        })

    return tree


async def delete_question_bank(
    registry_id: str,
    db: AsyncSession,
    redis=None,
) -> dict:
    """Delete a question bank: remove file, registry row, quiz session refs, and Redis cache."""
    result = await db.execute(select(ContentRegistry).where(ContentRegistry.id == uuid.UUID(registry_id)))
    registry = result.scalar_one_or_none()
    if not registry:
        raise HTTPException(status_code=404, detail="Content not found")

    # 1. Nullify quiz_session references so deletion isn't blocked by FK
    from app.models.quiz import QuizSession
    from sqlalchemy import update
    await db.execute(
        update(QuizSession)
        .where(QuizSession.content_registry_id == registry.id)
        .values(content_registry_id=None)
    )

    # 2. Delete registry row (cascades to content_access via FK)
    await db.execute(delete(ContentRegistry).where(ContentRegistry.id == registry.id))

    # 3. Remove physical file from disk
    full_path = resolve_content_path(*registry.file_path.split("/"))
    if full_path.exists():
        full_path.unlink()
        logger.info("question_bank_file_deleted", file_path=registry.file_path)

    # 4. Invalidate Redis cache
    if redis is not None:
        from app.services.cache_service import invalidate_cache
        await invalidate_cache(registry_id, redis)

    await db.flush()
    logger.info("question_bank_deleted", registry_id=registry_id)
    return {"message": "Question bank deleted successfully", "registry_id": registry_id}


async def get_content_preview(registry_id: str, db: AsyncSession) -> dict:
    result = await db.execute(select(ContentRegistry).where(ContentRegistry.id == uuid.UUID(registry_id)))
    registry = result.scalar_one_or_none()
    if not registry:
        raise HTTPException(status_code=404, detail="Content not found")

    full_path = resolve_content_path(*registry.file_path.split("/"))
    if not full_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")

    async with aiofiles.open(full_path, "r") as f:
        data = json.loads(await f.read())

    return data


def compute_file_hash(filepath: Path) -> str:
    with open(filepath, "rb") as f:
        return hashlib.md5(f.read()).hexdigest()
