"""Pydantic request/response schemas for auth endpoints."""

from datetime import date

from pydantic import BaseModel, EmailStr, field_validator


class RegisterRequest(BaseModel):
    """Validated registration payload including birthdate and GDPR consent."""

    username: str
    email: EmailStr
    password: str
    birthdate: date
    email_opt_in: bool = False
    lang_pref: str = "fr"

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
        """Enforce minimum 8-character password."""
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
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


class MeResponse(BaseModel):
    """Current user profile fields exposed by GET /auth/me."""

    id: str
    username: str
    email: str
    lang_pref: str
    email_opt_in: bool


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
        """Enforce minimum 8-character password on reset."""
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v
