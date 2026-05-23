"""Integration tests for rankings and player profile endpoints."""


async def test_rankings_returns_list(client):
    """GET /api/rankings returns 200 with a players list."""
    r = await client.get("/api/rankings")
    assert r.status_code == 200
    assert "players" in r.json()
    assert isinstance(r.json()["players"], list)


async def test_profile_not_found(client):
    """GET /api/profile for an unknown username returns 404."""
    r = await client.get("/api/profile/nobody_xyz_404")
    assert r.status_code == 404


async def test_profile_found_after_register(client, make_user):
    """A freshly registered user's profile is accessible and contains elo and badge."""
    data = make_user()
    await client.post("/auth/register", json=data)
    r = await client.get(f"/api/profile/{data['username']}")
    assert r.status_code == 200
    body = r.json()
    assert body["username"] == data["username"]
    assert "elo" in body
    assert "badge" in body
    assert "games_played" in body
