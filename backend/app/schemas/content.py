from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class CreateSubfolderRequest(BaseModel):
    root_folder: str
    subfolder_name: str


class UploadQuestionBankResponse(BaseModel):
    id: str
    file_path: str
    title: str
    question_count: int
    visibility: str


class SetVisibilityRequest(BaseModel):
    registry_id: str
    visibility: str
    org_ids: Optional[List[str]] = None


class SetSubfolderVisibilityRequest(BaseModel):
    root_folder: str
    subfolder: str
    visibility: str
    org_ids: Optional[List[str]] = None



class ContentRegistryResponse(BaseModel):
    id: str
    file_path: str
    root_folder: str
    subfolder: str
    title: str
    subject: Optional[str] = None
    source_type: str
    question_count: int
    visibility: str
    created_at: datetime

    model_config = {"from_attributes": True}


class FolderTreeResponse(BaseModel):
    root_folder: str
    subfolders: List[str]
    files: List[ContentRegistryResponse]


class ContentTreeResponse(BaseModel):
    folders: List[FolderTreeResponse]
