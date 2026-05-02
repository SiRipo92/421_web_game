"""Auth endpoints: register, login, me, forgot-password, reset-password."""

import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import create_access_token, get_current_user, hash_password, verify_password
from app.db.base import get_db
from app.db.models import GdprAuditLog, PasswordResetToken, PlayerStats, User
from app.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    MeResponse,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
)
from app.services.email import send_reset_email

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """Create a new user account and return a JWT."""
    existing = await db.execute(
        select(User).where((User.username == body.username) | (User.email == body.email))
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Username or email already taken")

    user = User(
        username=body.username,
        email=body.email,
        hashed_password=hash_password(body.password),
        birthdate=body.birthdate,
        lang_pref=body.lang_pref,
        email_opt_in=body.email_opt_in,
    )
    db.add(user)
    await db.flush()

    db.add(PlayerStats(user_id=user.id))
    db.add(
        GdprAuditLog(
            user_id=user.id,
            event_type="account_created",
            ip_address=request.client.host if request.client else None,
        )
    )
    await db.commit()
    await db.refresh(user)

    return TokenResponse(access_token=create_access_token(str(user.id)))


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate by email/password; remember_me extends JWT TTL to 30 days."""
    result = await db.execute(
        select(User).where(User.email == body.email, User.deleted_at.is_(None))
    )
    user = result.scalar_one_or_none()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return TokenResponse(
        access_token=create_access_token(str(user.id), remember_me=body.remember_me)
    )


@router.get("/me", response_model=MeResponse)
async def me(user: User = Depends(get_current_user)):
    """Return the authenticated user's public profile."""
    return MeResponse(
        id=str(user.id),
        username=user.username,
        email=user.email,
        lang_pref=user.lang_pref,
        email_opt_in=user.email_opt_in,
    )


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
async def forgot_password(body: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Send a password-reset email; always 202 to prevent email enumeration."""
    result = await db.execute(
        select(User).where(User.email == body.email, User.deleted_at.is_(None))
    )
    user = result.scalar_one_or_none()
    # Always return 202 to avoid email enumeration
    if not user:
        return {"detail": "If that email exists, a reset link has been sent"}

    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    expires_at = datetime.now(UTC) + timedelta(minutes=settings.reset_token_expire_minutes)

    db.add(PasswordResetToken(user_id=user.id, token_hash=token_hash, expires_at=expires_at))
    await db.commit()

    await send_reset_email(user.email, raw_token, lang=user.lang_pref)
    return {"detail": "If that email exists, a reset link has been sent"}


@router.post("/reset-password", status_code=status.HTTP_200_OK)
async def reset_password(body: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Validate a reset token and update the user's password hash."""
    token_hash = hashlib.sha256(body.token.encode()).hexdigest()
    now = datetime.now(UTC)

    result = await db.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.token_hash == token_hash,
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.expires_at > now,
        )
    )
    reset_token = result.scalar_one_or_none()
    if not reset_token:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    user_result = await db.execute(
        select(User).where(User.id == reset_token.user_id, User.deleted_at.is_(None))
    )
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    user.hashed_password = hash_password(body.new_password)
    reset_token.used_at = now
    await db.commit()

    return {"detail": "Password updated successfully"}
