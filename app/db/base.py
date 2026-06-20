"""SQLAlchemy async engine, session factory, and declarative base."""

from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings


def _strip_sslmode(url: str) -> str:
    """Remove ``sslmode`` query param from a database URL.

    asyncpg (the async Postgres driver) doesn't accept ``sslmode`` as a
    connection kwarg and raises ``TypeError`` if it's passed. psycopg2
    (the sync driver Alembic uses) does accept it. Because both drivers
    read the same ``DATABASE_URL`` env var, the simplest cross-compatible
    solution is: keep ``?sslmode=require`` in ``DATABASE_URL`` so
    Alembic's psycopg2 path works, then strip it here before asyncpg
    sees it. TLS is still negotiated automatically — asyncpg uses SSL
    by default when the server requires it (e.g. Neon, Fly Postgres).
    """
    parsed = urlparse(url)
    query_params = [(k, v) for k, v in parse_qsl(parsed.query) if k.lower() != "sslmode"]
    cleaned_query = urlencode(query_params)
    return urlunparse(parsed._replace(query=cleaned_query))


engine = create_async_engine(_strip_sslmode(settings.database_url), echo=settings.debug)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    """Declarative base class shared by all ORM models."""


async def get_db() -> AsyncSession:
    """FastAPI dependency that yields a short-lived async DB session."""  # type: ignore[return]
    async with AsyncSessionLocal() as session:
        yield session
