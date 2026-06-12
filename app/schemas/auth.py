"""Pydantic request/response schemas for auth endpoints."""

from datetime import date

from email_validator import EmailNotValidError
from email_validator import validate_email as _validate_email
from pydantic import BaseModel, EmailStr, field_validator

try:
    from MailChecker import MailChecker as _MailChecker

    _mailchecker_available = True
except ImportError:
    _mailchecker_available = False


class RegisterRequest(BaseModel):
    """Validated registration payload including birthdate and GDPR consent."""

    username: str
    email: EmailStr
    password: str
    birthdate: date
    email_opt_in: bool = False
    lang_pref: str = "fr"

    @field_validator("email", mode="after")
    @classmethod
    def email_deliverable(cls, v: str) -> str:
        """Reject addresses whose domain has no DNS MX/A record and disposable providers."""
        try:
            info = _validate_email(v, check_deliverability=True)
            normalized = info.normalized
        except EmailNotValidError as exc:
            raise ValueError(str(exc)) from exc
        except Exception:
            # DNS timeout / network error — accept the address, let the email bounce naturally
            normalized = v.lower().strip()
        if _mailchecker_available and not _MailChecker.is_valid(normalized):
            raise ValueError("Disposable email addresses are not accepted")
        return normalized

    @field_validator("username")
    @classmethod
    def username_valid(cls, v: str) -> str:
        """Enforce 2–32 character username length."""
        v = v.strip()
        if not (2 <= len(v) <= 32):
            raise ValueError("Username must be 2–32 characters")
        return v

    @field_validator("password")
    @classmethod
    def password_strong(cls, v: str) -> str:
        """Enforce 8–72 bytes, one uppercase, one digit or special character."""
        if len(v.encode("utf-8")) > 72:
            raise ValueError("Password must be 72 characters or fewer (bcrypt limit)")
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(c.isdigit() or not c.isalnum() for c in v):
            raise ValueError("Password must contain at least one number or special character")
        return v

    @field_validator("birthdate")
    @classmethod
    def age_minimum(cls, v: date) -> date:
        """Reject registrations from users under 15 years old."""
        from datetime import date as _date

        today = _date.today()
        age = today.year - v.year - ((today.month, today.day) < (v.month, v.day))
        if age < 15:
            raise ValueError("You must be at least 15 years old to register")
        return v

    @field_validator("lang_pref")
    @classmethod
    def lang_valid(cls, v: str) -> str:
        """Restrict lang_pref to supported locales 'fr' and 'en'."""
        if v not in ("fr", "en"):
            raise ValueError("lang_pref must be 'fr' or 'en'")
        return v


class LoginRequest(BaseModel):
    """Login credentials with optional remember_me flag."""

    email: EmailStr
    password: str
    remember_me: bool = False


class TokenResponse(BaseModel):
    """JWT bearer token returned after successful auth."""

    access_token: str
    token_type: str = "bearer"
    is_new: bool = False


class MeResponse(BaseModel):
    """Current user profile fields exposed by GET /auth/me."""

    id: str
    username: str
    email: str
    lang_pref: str
    theme_pref: str = "light"
    email_opt_in: bool
    profile_complete: bool = True
    has_avatar: bool = False
    role: str = "player"
    strike_count: int = 0
    chat_banned_until: str | None = None
    banned_until: str | None = None
    ban_reason: str | None = None


class CompleteProfileRequest(BaseModel):
    """Username and birthdate collected after Google SSO for new accounts."""

    username: str
    birthdate: date

    @field_validator("username")
    @classmethod
    def username_valid(cls, v: str) -> str:
        """Enforce 2–32 character username length."""
        v = v.strip()
        if not (2 <= len(v) <= 32):
            raise ValueError("Username must be 2–32 characters")
        return v

    @field_validator("birthdate")
    @classmethod
    def age_minimum(cls, v: date) -> date:
        """Reject users under 15 years old."""
        from datetime import date as _date

        today = _date.today()
        age = today.year - v.year - ((today.month, today.day) < (v.month, v.day))
        if age < 15:
            raise ValueError("You must be at least 15 years old to register")
        return v


class UpdateMeRequest(BaseModel):
    """Partial update for the current user's profile."""

    username: str | None = None
    lang_pref: str | None = None
    theme_pref: str | None = None

    @field_validator("username")
    @classmethod
    def username_valid(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not (2 <= len(v) <= 32):
            raise ValueError("Username must be 2–32 characters")
        return v

    @field_validator("lang_pref")
    @classmethod
    def lang_valid(cls, v: str | None) -> str | None:
        if v is None:
            return v
        if v not in ("fr", "en"):
            raise ValueError("lang_pref must be 'fr' or 'en'")
        return v

    @field_validator("theme_pref")
    @classmethod
    def theme_valid(cls, v: str | None) -> str | None:
        if v is None:
            return v
        if v not in ("light", "dark"):
            raise ValueError("theme_pref must be 'light' or 'dark'")
        return v


class ForgotPasswordRequest(BaseModel):
    """Email address to send a password-reset link to."""

    email: EmailStr


class ResetPasswordRequest(BaseModel):
    """Reset token and new password for the reset-password flow."""

    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_strong(cls, v: str) -> str:
        """Enforce 8–72 bytes, one uppercase, one digit or special character on reset."""
        if len(v.encode("utf-8")) > 72:
            raise ValueError("Password must be 72 characters or fewer (bcrypt limit)")
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(c.isdigit() or not c.isalnum() for c in v):
            raise ValueError("Password must contain at least one number or special character")
        return v


class GoogleAuthRequest(BaseModel):
    """Google ID token credential from the frontend OAuth flow."""

    credential: str
