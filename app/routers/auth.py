"""Auth endpoints: register, login, me, forgot-password, reset-password, google."""

import base64
import hashlib
import io
import secrets
from datetime import UTC, datetime, timedelta

import anthropic
from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile, status
from PIL import Image
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.limiter import limiter
from app.core.security import create_access_token, get_current_user, hash_password, verify_password
from app.db.base import get_db
from app.db.models import GamePlayer, GdprAuditLog, PasswordResetToken, PlayerStats, User
from app.schemas.auth import (
    CompleteProfileRequest,
    ForgotPasswordRequest,
    GoogleAuthRequest,
    LoginRequest,
    MeResponse,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    UpdateMeRequest,
)
from app.services.email import send_reset_email, send_welcome_email

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/username-available")
@limiter.limit("10/minute")
async def username_available(request: Request, u: str, db: AsyncSession = Depends(get_db)):
    """G97: pre-submission username check.

    Runs the G96 format check + blocklist + a DB uniqueness lookup so the
    register form can show inline feedback before the user wastes time
    filling in the rest of the form. Public + rate-limited 10/min/IP so
    it can't be used for username enumeration at scale.

    Response shape:
        {available: bool, error_code: str | None, error_message: str | None}

    error_code values:
        - "format"  → G96 layer-1 format rule violated
        - "content" → G96 layer-2 blocklist matched
        - "taken"   → username exists in DB
        - None      → handle is clean + free
    """
    from app.services.username_moderation import is_clean_username, validate_format

    u_stripped = u.strip()
    fmt_ok, fmt_err = validate_format(u_stripped)
    if not fmt_ok:
        return {"available": False, "error_code": "format", "error_message": fmt_err}
    block_ok, block_err = is_clean_username(u_stripped)
    if not block_ok:
        return {"available": False, "error_code": "content", "error_message": block_err}
    existing = await db.execute(select(User).where(User.username == u_stripped))
    if existing.scalar_one_or_none():
        return {
            "available": False,
            "error_code": "taken",
            "error_message": "Username already taken",
        }
    return {"available": True, "error_code": None, "error_message": None}


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def register(request: Request, body: RegisterRequest, db: AsyncSession = Depends(get_db)):
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

    # G76: fire welcome email only when the user opted in at signup.
    # Failure is logged inside send_welcome_email — never blocks signup.
    if user.email_opt_in:
        await send_welcome_email(
            to_email=user.email,
            username=user.username,
            user_id=str(user.id),
            lang=user.lang_pref,
        )

    return TokenResponse(access_token=create_access_token(str(user.id)))


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(request: Request, body: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate by email/password; remember_me extends JWT TTL to 30 days."""
    result = await db.execute(
        select(User).where(User.email == body.email, User.deleted_at.is_(None))
    )
    user = result.scalar_one_or_none()
    pw_ok = user and user.hashed_password and verify_password(body.password, user.hashed_password)
    if not pw_ok:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    # G42: account ban gate. chat_banned_until does NOT block login — those users
    # still play games, the chat WS handles their muting. Only banned_until
    # blocks the auth handshake itself.
    if user.banned_until and user.banned_until > datetime.now(UTC):
        raise HTTPException(
            status_code=403,
            detail={
                "error": "account_temporarily_suspended",
                "reason": user.ban_reason or "rule_violation",
                "until": user.banned_until.isoformat(),
            },
        )
    return TokenResponse(
        access_token=create_access_token(str(user.id), remember_me=body.remember_me)
    )


def _me_response(user: User) -> MeResponse:
    """Build the MeResponse including the G38 moderation fields."""
    return MeResponse(
        id=str(user.id),
        username=user.username,
        email=user.email,
        lang_pref=user.lang_pref,
        theme_pref=user.theme_pref,
        email_opt_in=user.email_opt_in,
        profile_complete=user.birthdate is not None,
        has_avatar=user.avatar_data is not None,
        role=user.role,
        strike_count=user.strike_count,
        chat_banned_until=user.chat_banned_until.isoformat() if user.chat_banned_until else None,
        banned_until=user.banned_until.isoformat() if user.banned_until else None,
        ban_reason=user.ban_reason,
    )


@router.get("/me", response_model=MeResponse)
async def me(user: User = Depends(get_current_user)):
    """Return the authenticated user's public profile."""
    return _me_response(user)


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

    await send_reset_email(user.email, raw_token, lang=user.lang_pref, username=user.username)
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


@router.post("/google", response_model=TokenResponse)
@limiter.limit("10/minute")
async def google_auth(
    request: Request, body: GoogleAuthRequest, db: AsyncSession = Depends(get_db)
):
    """Verify a Google ID token and sign in or register the user."""
    if not settings.google_client_id:
        raise HTTPException(status_code=503, detail="Google sign-in not configured")
    try:
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token

        info = id_token.verify_oauth2_token(
            body.credential, google_requests.Request(), settings.google_client_id
        )
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid Google token")

    google_id = info["sub"]
    email = info["email"]

    result = await db.execute(
        select(User).where((User.google_id == google_id) | (User.email == email))
    )
    user = result.scalar_one_or_none()

    is_new = False
    if user:
        if not user.google_id:
            user.google_id = google_id
        await db.commit()
    else:
        is_new = True
        username = (info.get("name") or email.split("@")[0])[:32]
        # Ensure username uniqueness
        base = username
        suffix = 0
        while True:
            existing = await db.execute(select(User).where(User.username == username))
            if not existing.scalar_one_or_none():
                break
            suffix += 1
            username = f"{base[:30]}{suffix}"

        user = User(
            username=username,
            email=email,
            hashed_password=None,
            google_id=google_id,
            lang_pref="fr",
        )
        db.add(user)
        await db.flush()
        db.add(PlayerStats(user_id=user.id))
        db.add(
            GdprAuditLog(
                user_id=user.id,
                event_type="account_created_google",
                ip_address=request.client.host if request.client else None,
            )
        )
        await db.commit()
        await db.refresh(user)

    return TokenResponse(access_token=create_access_token(str(user.id)), is_new=is_new)


@router.post("/complete-profile", status_code=200)
@limiter.limit("10/minute")
async def complete_profile(
    request: Request,
    body: CompleteProfileRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Set username and birthdate for accounts created via Google SSO."""
    existing = await db.execute(
        select(User).where(User.username == body.username, User.id != current_user.id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Username already taken")

    current_user.username = body.username
    current_user.birthdate = body.birthdate
    await db.commit()
    return {"detail": "Profile completed"}


@router.patch("/me", response_model=MeResponse)
async def update_me(
    body: UpdateMeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update the current user's username and/or language preference."""
    if body.username is not None and body.username != current_user.username:
        existing = await db.execute(
            select(User).where(User.username == body.username, User.id != current_user.id)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Username already taken")
        current_user.username = body.username
    if body.lang_pref is not None:
        current_user.lang_pref = body.lang_pref
    if body.theme_pref is not None:
        current_user.theme_pref = body.theme_pref
    await db.commit()
    await db.refresh(current_user)
    return _me_response(current_user)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete the account immediately; data is purged after the grace period."""
    now = datetime.now(UTC)
    current_user.deletion_requested_at = now
    current_user.deleted_at = now
    db.add(
        GdprAuditLog(
            user_id=current_user.id,
            event_type="account_deleted",
        )
    )
    await db.commit()


@router.get("/export")
async def export_data(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all stored personal data for the current user as JSON."""
    stats = await db.get(PlayerStats, current_user.id)
    games_result = await db.execute(select(GamePlayer).where(GamePlayer.user_id == current_user.id))
    games = games_result.scalars().all()
    return {
        "account": {
            "username": current_user.username,
            "email": current_user.email,
            "lang_pref": current_user.lang_pref,
            "theme_pref": current_user.theme_pref,
            "email_opt_in": current_user.email_opt_in,
            "created_at": current_user.created_at.isoformat(),
        },
        "stats": {
            "elo": stats.elo,
            "games_played": stats.games_played,
            "parties_survived": stats.parties_survived,
            "parties_lost": stats.parties_lost,
            "manches_played": stats.manches_played,
            "manches_lost": stats.manches_lost,
            "current_streak": stats.current_streak,
            "longest_streak": stats.longest_streak,
        }
        if stats
        else None,
        "games": [
            {
                "placement": g.placement,
                "final_tokens": g.final_tokens,
                "round_points": g.round_points,
            }
            for g in games
        ],
    }


def _moderate_image(jpeg_bytes: bytes) -> bool:
    """Return True if the image passes Claude Haiku content moderation."""
    if not settings.anthropic_api_key:
        return True
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    b64 = base64.standard_b64encode(jpeg_bytes).decode()
    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=5,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {"type": "base64", "media_type": "image/jpeg", "data": b64},
                    },
                    {
                        "type": "text",
                        "text": (
                            "You are a content moderator for a family-friendly gaming platform. "
                            "Does this image contain nudity, sexual content, hate symbols, or "
                            "extreme violence? Answer with only SAFE or UNSAFE."
                        ),
                    },
                ],
            }
        ],
    )
    return msg.content[0].text.strip().upper().startswith("SAFE")


def _process_image(data: bytes) -> bytes:
    """Resize to 200×200 cover crop and encode as JPEG."""
    img = Image.open(io.BytesIO(data)).convert("RGB")
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    img = img.crop((left, top, left + side, top + side)).resize((200, 200), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85, optimize=True)
    return buf.getvalue()


@router.post("/avatar", status_code=200)
@limiter.limit("10/minute")
async def upload_avatar(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload, moderate, and store a profile avatar."""
    if file.content_type not in ("image/jpeg", "image/png", "image/webp", "image/gif"):
        raise HTTPException(status_code=415, detail="Unsupported image type")
    raw = await file.read(6 * 1024 * 1024)  # read up to 6 MB
    if len(raw) >= 6 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image too large (max 5 MB)")
    try:
        jpeg = _process_image(raw)
    except Exception:
        raise HTTPException(status_code=400, detail="Could not process image")
    if not _moderate_image(jpeg):
        raise HTTPException(status_code=400, detail="Image contains inappropriate content")
    current_user.avatar_data = jpeg
    current_user.avatar_content_type = "image/jpeg"
    await db.commit()
    return {"detail": "Avatar updated"}


@router.delete("/avatar", status_code=204)
async def delete_avatar(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove the current user's custom avatar."""
    current_user.avatar_data = None
    current_user.avatar_content_type = None
    await db.commit()


@router.get("/avatar/{user_id}", response_class=Response)
async def get_avatar(user_id: str, db: AsyncSession = Depends(get_db)):
    """Serve a user's avatar image; 404 if not set."""
    import uuid as _uuid

    try:
        uid = _uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Not found")
    user = await db.get(User, uid)
    if not user or not user.avatar_data:
        raise HTTPException(status_code=404, detail="No avatar")
    return Response(
        content=user.avatar_data,
        media_type=user.avatar_content_type or "image/jpeg",
        headers={"Cache-Control": "private, max-age=3600"},
    )
