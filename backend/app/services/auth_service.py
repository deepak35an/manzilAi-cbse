import json
import random
import uuid
import asyncio
from datetime import datetime, timedelta
from typing import Optional

from fastapi import HTTPException
from jose import jwt, JWTError
import redis.asyncio as aioredis
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import settings
from app.models.user import User, UserRole
from app.utils.logging import logger
from app.utils.helpers import normalize_phone
from app.utils.email import send_otp_email


def generate_otp() -> str:
    return str(random.randint(100000, 999999))


async def send_otp(phone: str, role: str, redis: aioredis.Redis, db: AsyncSession) -> dict:
    phone = normalize_phone(phone)
    if role not in {"student", "org_admin", "super_admin"}:
        role = "student"

    # Students use username + password — not OTP
    if role == "student":
        raise HTTPException(
            status_code=403,
            detail="Students must log in using their username and password, not OTP.",
        )

    # Reverse Authentication: ALL users must be pre-registered
    result = await db.execute(
        select(User).where(User.phone == phone, User.role == UserRole(role))
    )
    user = result.scalar_one_or_none()

    if not user:
        detail_msg = "Your account is not registered. Please contact your organization or the Super Admin to register."
        if role == "org_admin":
            detail_msg = "Your organization is not registered. Please contact the Super Admin."

        raise HTTPException(status_code=403, detail=detail_msg)

    otp = generate_otp()
    key = f"otp:{phone}"
    payload = json.dumps({"otp": otp, "role": role})
    await redis.setex(key, settings.OTP_EXPIRY_SECONDS, payload)
    logger.info("otp_generated", phone=phone, otp=otp, role=role)
    print(f"\n{'='*48}")
    print(f"  📱 OTP for {phone}: {otp}  ({role})")
    print(f"{'='*48}\n", flush=True)

    email_sent = False
    if user.email and user.email.strip():
        asyncio.create_task(send_otp_email(user.email.strip(), otp, user.name))
        email_sent = True

    return {
        "message": "OTP sent successfully",
        "expires_in": settings.OTP_EXPIRY_SECONDS,
        "email_sent": email_sent,
    }


async def student_login(username: str, password: str, db: AsyncSession) -> dict:
    """Authenticate a student by username + password. Returns a token pair."""
    from app.models.student_credentials import StudentCredentials
    from app.utils.credentials import verify_password
    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(StudentCredentials).where(StudentCredentials.username == username.strip().lower())
    )
    creds = result.scalar_one_or_none()

    if not creds or not verify_password(password, creds.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid username or password.")

    user_result = await db.execute(
        select(User)
        .options(selectinload(User.organization))
        .where(User.id == creds.user_id)
    )
    user = user_result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password.")

    if user.role != UserRole.student:
        raise HTTPException(status_code=403, detail="This login method is only for students.")

    if user.org_id is None:
        raise HTTPException(
            status_code=403,
            detail="You are not registered as a student. Please contact your organization.",
        )

    access_token = create_token(
        {"user_id": str(user.id), "role": user.role.value, "org_id": str(user.org_id) if user.org_id else None},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    refresh_token = create_token(
        {"user_id": str(user.id), "type": "refresh"},
        expires_delta=timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {
            "id": str(user.id),
            "phone": user.phone,
            "email": user.email,
            "name": user.name,
            "role": user.role.value,
            "org_id": str(user.org_id) if user.org_id else None,
            "org_name": user.org_name,
            "username": creds.username,
        },
    }



async def verify_otp(
    phone: str,
    otp: str,
    redis: aioredis.Redis,
    db: AsyncSession,
) -> Optional[dict]:
    phone = normalize_phone(phone)
    key = f"otp:{phone}"
    stored_raw = await redis.get(key)

    if stored_raw is None:
        return None

    try:
        stored_data = json.loads(stored_raw)
        stored_otp = stored_data["otp"]
        stored_role = stored_data.get("role", "student")
    except (json.JSONDecodeError, KeyError, TypeError):
        stored_otp = stored_raw
        stored_role = "student"

    if stored_otp != otp:
        return None

    await redis.delete(key)

    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(User)
        .options(selectinload(User.organization))
        .where(User.phone == phone)
    )
    user = result.scalar_one_or_none()

    if user is None:
        return None

    # Block students who have been removed from their organization
    if user.role == UserRole.student and user.org_id is None:
        raise HTTPException(
            status_code=403,
            detail="You are not registered as a student. Please contact your organization to register your account."
        )

    # Role validation: ensure the role at OTP send matches the user's DB role
    if stored_role != user.role.value:
        raise HTTPException(
            status_code=403,
            detail=f"This account is registered as '{user.role.value}', not '{stored_role}'. Please select the correct role.",
        )
    
    await db.flush()

    access_token = create_token(
        {"user_id": str(user.id), "role": user.role.value, "org_id": str(user.org_id) if user.org_id else None},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    refresh_token = create_token(
        {"user_id": str(user.id), "type": "refresh"},
        expires_delta=timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {
            "id": str(user.id),
            "phone": user.phone,
            "email": user.email,
            "name": user.name,
            "role": user.role.value,
            "org_id": str(user.org_id) if user.org_id else None,
            "org_name": user.org_name,
        },
    }


def create_token(data: dict, expires_delta: timedelta) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + expires_delta
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except JWTError:
        return None
