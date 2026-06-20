"""Password hashing, JWT creation, and FastAPI auth dependencies."""

from datetime import UTC, datetime, timedelta
from typing import Optional

import bcrypt as _bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.base import get_db
from app.db.models import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")
oauth2_optional = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)

ALGORITHM = "HS256"

# bcrypt supports at most 72 bytes — truncate to preserve old passlib behaviour
_MAX_PW_BYTES = 72

# G90: throttle last_seen_at writes — refresh at most once every 5 minutes
# per user. Avoids hot DB writes on chatty WS clients while keeping the
# admin "online" filter accurate to ±5 min.
_LAST_SEEN_REFRESH_SECONDS = 300


def hash_password(password: str) -> str:
    """Return a bcrypt hash of the given password."""
    return _bcrypt.hashpw(password.encode()[:_MAX_PW_BYTES], _bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    """Return True if plain matches the bcrypt hash."""
    return _bcrypt.checkpw(plain.encode()[:_MAX_PW_BYTES], hashed.encode())


def create_access_token(user_id: str, remember_me: bool = False) -> str:
    """Issue a signed JWT; remember_me extends TTL from minutes to days."""
    if remember_me:
        delta = timedelta(days=settings.remember_me_expire_days)
    else:
        delta = timedelta(minutes=settings.access_token_expire_minutes)
    expire = datetime.now(UTC) + delta
    return jwt.encode({"sub": user_id, "exp": expire}, settings.secret_key, algorithm=ALGORITHM)


async def _user_from_token(token: str, db: AsyncSession) -> Optional[User]:
    """Decode token and return the matching User, or None on any failure."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            return None
    except JWTError:
        return None
    result = await db.execute(select(User).where(User.id == user_id, User.deleted_at.is_(None)))
    return result.scalar_one_or_none()


async def _refresh_last_seen(user: User, db: AsyncSession) -> None:
    """G90: throttled write of User.last_seen_at on authenticated activity.

    Updates if the stored timestamp is older than _LAST_SEEN_REFRESH_SECONDS,
    or null. Errors are swallowed — this is a best-effort liveness signal,
    not load-bearing.
    """
    now = datetime.now(UTC)
    if user.last_seen_at is not None:
        # last_seen_at is timezone-aware (TIMESTAMPTZ); subtraction is safe.
        age = (now - user.last_seen_at).total_seconds()
        if age < _LAST_SEEN_REFRESH_SECONDS:
            return
    try:
        user.last_seen_at = now
        await db.commit()
    except Exception:
        await db.rollback()


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """FastAPI dependency: raise 401 if token is missing or invalid."""
    user = await _user_from_token(token, db)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    await _refresh_last_seen(user, db)
    return user


async def get_optional_user(
    token: Optional[str] = Depends(oauth2_optional),
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    """FastAPI dependency: return User or None (no error for missing token)."""
    if not token:
        return None
    return await _user_from_token(token, db)


def require_moderator(user: User = Depends(get_current_user)) -> User:
    """FastAPI dependency: 403 unless user.role is moderator or admin."""
    if user.role not in ("moderator", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Moderator access required",
        )
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    """FastAPI dependency: 403 unless user.role is admin."""
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return user
