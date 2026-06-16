"""App configuration loaded from .env via pydantic-settings."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All environment-driven settings; validated at startup."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    debug: bool = False
    database_url: str = "postgresql+asyncpg://app:change_me@localhost:5432/fourtwentyone"
    # Separate DB the test suite runs against — keeps `tests/` from
    # polluting the live `users` / `games` tables. When set, tests/
    # conftest swaps DATABASE_URL → TEST_DATABASE_URL *before* any app
    # module imports (pydantic-settings reads env at instantiation time).
    test_database_url: str = ""
    secret_key: str = "dev-insecure-key-change-in-production"
    access_token_expire_minutes: int = 30
    remember_me_expire_days: int = 30
    brevo_api_key: str = ""
    app_url: str = "http://localhost:8421"
    reset_token_expire_minutes: int = 60
    anthropic_api_key: str = ""
    retention_dry_run: bool = True
    deletion_grace_days: int = 30
    sentry_dsn: str = ""
    google_client_id: str = ""
    contact_email: str = ""
    # G68 follow-up: env-driven so legal pages reflect current values
    # without redeploys, and the email sender can be swapped without
    # touching code. Production sets SENDER_EMAIL once the domain is
    # verified in Brevo; the default below is only used in tests.
    sender_email: str = "421 Bistro <noreply@421bistro.com>"
    # RGPD inactive-account auto-deletion (G70). Default 2 years → 30
    # day grace, override via env to test the pipeline.
    inactive_account_warning_years: int = 2
    inactive_account_deletion_days: int = 30
    # RGPD breach notification window (Art. 33-34). 72h is the legal
    # default in the EU; surfaced in the Privacy page.
    breach_notification_hours: int = 72
    # Moderation audit log retention (referenced in Privacy s7 + Terms s6).
    moderation_log_retention_days: int = 365


settings = Settings()
