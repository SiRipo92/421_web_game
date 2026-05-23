"""Integration tests for the avatar upload / serve / delete endpoints."""

import io

from PIL import Image


def _png_bytes(size: int = 64) -> bytes:
    """Return a small valid PNG as bytes."""
    img = Image.new("RGB", (size, size), color=(180, 120, 50))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


async def _register_get_id_and_token(client, make_user) -> tuple[str, str]:
    data = make_user()
    reg = await client.post("/auth/register", json=data)
    token = reg.json()["access_token"]
    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    return me.json()["id"], token


async def test_upload_avatar_happy_path(client, make_user, monkeypatch):
    """POST /auth/avatar accepts a PNG, runs processing (no Claude moderation), commits."""
    # Disable Claude moderation to keep the test offline
    monkeypatch.setattr("app.routers.auth.settings.anthropic_api_key", "")
    _, token = await _register_get_id_and_token(client, make_user)
    files = {"file": ("a.png", _png_bytes(), "image/png")}
    r = await client.post("/auth/avatar", headers={"Authorization": f"Bearer {token}"}, files=files)
    assert r.status_code == 200


async def test_upload_avatar_unsupported_type_returns_415(client, make_user):
    """Non-image content type → 415."""
    _, token = await _register_get_id_and_token(client, make_user)
    files = {"file": ("a.txt", b"hello world", "text/plain")}
    r = await client.post("/auth/avatar", headers={"Authorization": f"Bearer {token}"}, files=files)
    assert r.status_code == 415


async def test_upload_avatar_invalid_image_returns_400(client, make_user, monkeypatch):
    """Bytes that aren't a real image → 400 from the processing step."""
    monkeypatch.setattr("app.routers.auth.settings.anthropic_api_key", "")
    _, token = await _register_get_id_and_token(client, make_user)
    files = {"file": ("a.png", b"not really a png", "image/png")}
    r = await client.post("/auth/avatar", headers={"Authorization": f"Bearer {token}"}, files=files)
    assert r.status_code == 400


async def test_get_avatar_serves_after_upload(client, make_user, monkeypatch):
    """GET /auth/avatar/{user_id} returns the JPEG bytes after upload."""
    monkeypatch.setattr("app.routers.auth.settings.anthropic_api_key", "")
    user_id, token = await _register_get_id_and_token(client, make_user)
    files = {"file": ("a.png", _png_bytes(), "image/png")}
    await client.post("/auth/avatar", headers={"Authorization": f"Bearer {token}"}, files=files)

    r = await client.get(f"/auth/avatar/{user_id}")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("image/")


async def test_get_avatar_missing_user_returns_404(client):
    """Unknown user_id → 404."""
    import uuid

    r = await client.get(f"/auth/avatar/{uuid.uuid4()}")
    assert r.status_code == 404


async def test_get_avatar_invalid_uuid_returns_404(client):
    """Non-UUID user_id → 404 (not 500)."""
    r = await client.get("/auth/avatar/not-a-uuid")
    assert r.status_code == 404


async def test_delete_avatar(client, make_user, monkeypatch):
    """DELETE /auth/avatar clears the avatar and subsequent GET returns 404."""
    monkeypatch.setattr("app.routers.auth.settings.anthropic_api_key", "")
    user_id, token = await _register_get_id_and_token(client, make_user)
    files = {"file": ("a.png", _png_bytes(), "image/png")}
    await client.post("/auth/avatar", headers={"Authorization": f"Bearer {token}"}, files=files)

    r = await client.delete("/auth/avatar", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 204

    r2 = await client.get(f"/auth/avatar/{user_id}")
    assert r2.status_code == 404
