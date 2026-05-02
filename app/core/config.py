from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    debug: bool = False
    database_url: str = "postgresql+asyncpg://app:change_me@localhost:5432/fourtwentyone"
    secret_key: str = "dev-insecure-key-change-in-production"
    access_token_expire_minutes: int = 30
    anthropic_api_key: str = ""
    retention_dry_run: bool = True
    deletion_grace_days: int = 30
    sentry_dsn: str = ""


settings = Settings()
