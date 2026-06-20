"""Shared fixtures for integration tests."""

import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.db.base import AsyncSessionLocal, engine
from app.main import app

# Tables to TRUNCATE between runs. CASCADE handles every FK that points
# at users so we don't have to enumerate them by hand. Listed in the
# same order as `app/db/models.py`'s class definitions for grep-friendliness.
_TRUNCATE_TABLES = (
    "users",
    "games",
    "game_players",
    "player_stats",
    "gdpr_audit_log",
    "password_reset_tokens",
)


async def _truncate_all() -> None:
    """Wipe every user-data table on the (test) database in one statement.

    Belt-and-suspenders safety: assert that the engine is pointed at a
    URL containing 'test'. The top-level conftest already guards this
    at process start, but if anyone ever short-circuits that check or
    rebinds the engine, this stops a TRUNCATE from running against prod.
    """
    url = str(engine.url)
    if "test" not in url.lower():
        raise RuntimeError(
            f"_truncate_all refused to run — engine URL doesn't contain 'test' ({url}). "
            "Possible misconfiguration: refusing to wipe a non-test database."
        )
    async with AsyncSessionLocal() as db:
        await db.execute(
            text(f"TRUNCATE TABLE {', '.join(_TRUNCATE_TABLES)} RESTART IDENTITY CASCADE")
        )
        await db.commit()


@pytest_asyncio.fixture(scope="session", autouse=True)
async def _wipe_test_db_around_session():
    """Wipe the test DB at session start AND end so no rows linger
    between pytest invocations.

    Why both ends?
    - Start: ensures we don't pick up leftovers from a previous run
      that crashed before its end-of-session hook fired.
    - End: ensures the next run (or `psql` inspection) starts empty.
    """
    await _truncate_all()
    yield
    await _truncate_all()


@pytest.fixture
async def client():
    """ASGI test client — triggers app lifespan (startup/shutdown)."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


@pytest.fixture
def make_user():
    """Factory for unique user payloads — prevents cross-test collisions."""

    def _make(prefix: str = "test") -> dict:
        # G96 username constraint: 3-20 chars, [A-Za-z0-9_.-], no consecutive
        # special chars. Generated usernames must fit; cap prefix to 11 chars
        # and use a 6-char UID suffix to land at <= 18 chars total. Email
        # field is unconstrained so we keep the full prefix there for
        # easier test debugging.
        uid_full = uuid.uuid4().hex[:8]
        prefix_clean = prefix[:11].replace("__", "_").rstrip("_.-")
        return {
            "username": f"{prefix_clean}_{uid_full[:6]}",
            "email": f"{prefix}_{uid_full}@example.com",
            "password": "Testpassword1",
            "birthdate": "1990-01-01",
        }

    return _make
