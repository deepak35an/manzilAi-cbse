from pydantic import BaseModel, field_validator
from typing import Optional, List
from datetime import datetime


class OrgCreateRequest(BaseModel):
    name: str
    slug: Optional[str] = None          # auto-generated from name if omitted
    admin_phone: Optional[str] = None
    admin_email: Optional[str] = None
    duration_months: int = 12            # 6 or 12

    @field_validator("duration_months")
    @classmethod
    def validate_duration(cls, v: int) -> int:
        if v not in (6, 12):
            raise ValueError("duration_months must be 6 or 12")
        return v


class OrgUpdateRequest(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None
    config: Optional[dict] = None
    admin_phone: Optional[str] = None   # update the org admin's phone
    admin_email: Optional[str] = None   # update the org admin's email
    renew_months: Optional[int] = None  # extend subscription by 6 or 12 months

    @field_validator("renew_months")
    @classmethod
    def validate_renew(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and v not in (6, 12):
            raise ValueError("renew_months must be 6 or 12")
        return v


class OrgResponse(BaseModel):
    id: str
    name: str
    slug: str
    is_active: bool
    created_at: datetime
    admin_phone: Optional[str] = None
    admin_email: Optional[str] = None
    admin_name: Optional[str] = None
    valid_until: Optional[datetime] = None

    model_config = {"from_attributes": True}


class RequestQuestionBankRequest(BaseModel):
    root_folder: str
    subfolder: str
    title: str
    subject: Optional[str] = None
    source_type: str = "standard"


class RequestQuestionBankResponse(BaseModel):
    task_id: str
    status: str
    message: str


class ReviewQuestionBankRequest(BaseModel):
    task_id: str
    questions: List[dict]


class ConfirmQuestionBankRequest(BaseModel):
    task_id: str


class StudentUploadRequest(BaseModel):
    students: List[dict]


class AssignAdminRequest(BaseModel):
    phone: str
