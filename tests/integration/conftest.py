"""Shared fixtures for integration tests."""

import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
async def client():
    """ASGI test client — triggers app lifespan (startup/shutdown)."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


@pytest.fixture
def make_user():
    """Factory for unique user payloads — prevents cross-test collisions."""

    def _make(prefix: str = "test") -> dict:
        uid = uuid.uuid4().hex[:8]
        return {
            "username": f"{prefix}_{uid}",
            "email": f"{prefix}_{uid}@example.com",
            "password": "testpassword123",
            "birthdate": "1990-01-01",
        }

    return _make
