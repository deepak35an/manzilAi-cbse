from pydantic import BaseModel
from typing import Optional


class SendOtpRequest(BaseModel):
    phone: str
    role: str = "student"


class SendOtpResponse(BaseModel):
    message: str
    expires_in: int


class VerifyOtpRequest(BaseModel):
    phone: str
    otp: str


class StudentLoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: "UserResponse"


class UserResponse(BaseModel):
    id: str
    phone: str
    email: Optional[str] = None
    name: str
    role: str
    org_id: Optional[str] = None
    org_name: Optional[str] = None
    username: Optional[str] = None  # populated for students

    model_config = {"from_attributes": True}


class ChangePhoneRequest(BaseModel):
    new_phone: Optional[str] = None
    new_email: Optional[str] = None


