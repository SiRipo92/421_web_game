"""Integration tests for the G97 username-available endpoint.

GET /auth/username-available?u=<handle> is the pre-submission check the
registration form uses for inline feedback. It must:
  - Reject blocklist handles with error_code='content'
  - Reject format-violation handles with error_code='format'
  - Reject taken handles with error_code='taken'
  - Accept clean+free handles with available=True
  - Be public (no auth) and rate-limited (don't enable enumeration scans)
"""


async def test_username_available_accepts_clean_handle(client):
    """A well-formed handle not yet in the DB returns available=True."""
    r = await client.get("/auth/username-available", params={"u": "Sierra"})
    assert r.status_code == 200
    body = r.json()
    assert body["available"] is True
    assert body["error_code"] is None
    assert body["error_message"] is None


async def test_username_available_rejects_blocklisted_handle(client):
    """G96 blocklist hits surface as error_code='content'."""
    r = await client.get("/auth/username-available", params={"u": "BigBite420"})
    assert r.status_code == 200
    body = r.json()
    assert body["available"] is False
    assert body["error_code"] == "content"
    assert "inappropriate" in body["error_message"].lower()


async def test_username_available_rejects_bad_format(client):
    """G96 format failures surface as error_code='format'."""
    r = await client.get("/auth/username-available", params={"u": "ab"})
    assert r.status_code == 200
    body = r.json()
    assert body["available"] is False
    assert body["error_code"] == "format"
    assert "at least 3" in body["error_message"]


async def test_username_available_rejects_taken_handle(client, make_user):
    """An existing username surfaces as error_code='taken'."""
    data = make_user("availchk")
    reg = await client.post("/auth/register", json=data)
    assert reg.status_code == 201

    r = await client.get("/auth/username-available", params={"u": data["username"]})
    assert r.status_code == 200
    body = r.json()
    assert body["available"] is False
    assert body["error_code"] == "taken"


async def test_username_available_strips_whitespace(client):
    """Trailing whitespace shouldn't make a clean handle look invalid."""
    r = await client.get("/auth/username-available", params={"u": "Sierra "})
    assert r.json()["available"] is True


async def test_username_available_format_check_runs_before_blocklist(client):
    """Format errors are surfaced before blocklist content errors —
    more specific feedback for the user."""
    # "B!gB1te420" fails format (has !) AND would fail blocklist
    r = await client.get("/auth/username-available", params={"u": "B!gB1te420"})
    body = r.json()
    assert body["error_code"] == "format"
