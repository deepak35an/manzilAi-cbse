import time

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import redis.asyncio as aioredis

from app.dependencies import get_db, get_redis
from app.schemas.auth import SendOtpRequest, SendOtpResponse, VerifyOtpRequest, TokenResponse, UserResponse, ChangePhoneRequest, StudentLoginRequest
from app.services.auth_service import send_otp, verify_otp, student_login
from app.middleware.auth import get_current_user
from app.models.user import User

router = APIRouter()

OTP_RATE_LIMIT = 5   # max sends per window
OTP_RATE_WINDOW = 60  # seconds


async def _check_otp_rate_limit(phone: str, redis: aioredis.Redis) -> None:
    """Allow at most OTP_RATE_LIMIT send-otp calls per phone per OTP_RATE_WINDOW seconds."""
    key = f"otp_rate:{phone}"
    now = time.time()
    window_start = now - OTP_RATE_WINDOW
    pipe = redis.pipeline()
    pipe.zremrangebyscore(key, 0, window_start)
    pipe.zadd(key, {str(now): now})
    pipe.zcard(key)
    pipe.expire(key, OTP_RATE_WINDOW)
    results = await pipe.execute()
    if results[2] > OTP_RATE_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many OTP requests. Please wait before trying again.",
        )


@router.post("/send-otp", response_model=SendOtpResponse)
async def send_otp_endpoint(
    request: SendOtpRequest,
    redis: aioredis.Redis = Depends(get_redis),
    db: AsyncSession = Depends(get_db),
):
    await _check_otp_rate_limit(request.phone, redis)
    result = await send_otp(request.phone, request.role, redis, db)
    return result


@router.post("/verify-otp", response_model=TokenResponse)
async def verify_otp_endpoint(
    request: VerifyOtpRequest,
    redis: aioredis.Redis = Depends(get_redis),
    db: AsyncSession = Depends(get_db),
):
    result = await verify_otp(request.phone, request.otp, redis, db)
    if result is None:
        raise HTTPException(status_code=401, detail="Invalid or expired OTP")
    return result


@router.post("/student-login", response_model=TokenResponse)
async def student_login_endpoint(
    request: StudentLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """Username + password login endpoint for students only."""
    return await student_login(request.username, request.password, db)


@router.get("/me", response_model=UserResponse)
async def get_me(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy.orm import selectinload
    from sqlalchemy import select as sa_select
    from app.models.user import User as UserModel

    # Reload with credentials for students
    result = await db.execute(
        sa_select(UserModel)
        .options(selectinload(UserModel.credentials), selectinload(UserModel.organization))
        .where(UserModel.id == user.id)
    )
    user = result.scalar_one()

    return UserResponse(
        id=str(user.id),
        phone=user.phone,
        email=user.email,
        name=user.name,
        role=user.role.value,
        org_id=str(user.org_id) if user.org_id else None,
        org_name=user.org_name,
        username=user.credentials.username if user.credentials else None,
    )



@router.patch("/change-phone", response_model=UserResponse)
async def change_phone_endpoint(
    request: ChangePhoneRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if request.new_phone is not None:
        new_phone = request.new_phone.strip()
        if not new_phone.isdigit() or len(new_phone) != 10:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Mobile number must be exactly 10 digits.",
            )
        if new_phone != user.phone:
            stmt = select(User).where(User.phone == new_phone, User.id != user.id)
            res = await db.execute(stmt)
            if res.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="This mobile number is already registered to another account.",
                )
            user.phone = new_phone

    if request.new_email is not None:
        new_email = request.new_email.strip().lower() if request.new_email.strip() else None
        if new_email and new_email != user.email:
            stmt = select(User).where(User.email == new_email, User.id != user.id)
            res = await db.execute(stmt)
            if res.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"The email address '{new_email}' is already registered to another account.",
                )
        user.email = new_email

    await db.commit()
    await db.refresh(user)

    return UserResponse(
        id=str(user.id),
        phone=user.phone,
        email=user.email,
        name=user.name,
        role=user.role.value,
        org_id=str(user.org_id) if user.org_id else None,
        org_name=user.org_name,
    )

