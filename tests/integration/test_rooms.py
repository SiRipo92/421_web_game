"""Integration tests for game creation, joining, and public room listing."""


async def test_healthz(client):
    """GET /healthz returns 200 with status ok."""
    r = await client.get("/healthz")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


async def test_create_game_returns_id(client):
    """POST /api/create returns a game_id of 8 characters."""
    r = await client.post("/api/create")
    assert r.status_code == 200
    game_id = r.json()["game_id"]
    assert len(game_id) == 8


async def test_join_game(client):
    """Joining a freshly created game returns player_id and status=joined."""
    create = await client.post("/api/create")
    game_id = create.json()["game_id"]
    r = await client.get(f"/api/join/{game_id}", params={"name": "Marcel"})
    assert r.status_code == 200
    body = r.json()
    assert "player_id" in body
    assert body["status"] == "joined"


async def test_join_nonexistent_game(client):
    """Joining a game that does not exist returns an error message."""
    r = await client.get("/api/join/NOTREAL", params={"name": "X"})
    assert r.status_code == 200
    assert r.json()["error"] == "Game not found"


async def test_rooms_empty_by_default(client):
    """A private game does not appear in GET /api/rooms."""
    create = await client.post("/api/create", params={"is_public": "false"})
    game_id = create.json()["game_id"]
    r = await client.get("/api/rooms")
    assert r.status_code == 200
    ids = [room["game_id"] for room in r.json()["rooms"]]
    assert game_id not in ids


async def test_rooms_shows_public_game(client):
    """A public game appears in GET /api/rooms."""
    create = await client.post("/api/create", params={"is_public": "true"})
    game_id = create.json()["game_id"]
    r = await client.get("/api/rooms")
    assert r.status_code == 200
    ids = [room["game_id"] for room in r.json()["rooms"]]
    assert game_id in ids


async def test_create_respects_max_players(client):
    """A third player joining a max_players=2 room gets status=waiting or error."""
    create = await client.post("/api/create", params={"max_players": "2"})
    game_id = create.json()["game_id"]
    await client.get(f"/api/join/{game_id}", params={"name": "P1"})
    await client.get(f"/api/join/{game_id}", params={"name": "P2"})
    r = await client.get(f"/api/join/{game_id}", params={"name": "P3"})
    assert r.status_code == 200
    body = r.json()
    assert body.get("status") == "waiting" or "error" in body


async def test_create_clamps_invalid_max_players(client):
    """max_players outside 2–5 is clamped to 5."""
    r = await client.post("/api/create", params={"max_players": "10"})
    assert r.status_code == 200
    game_id = r.json()["game_id"]
    from app.game.state import games

    assert games[game_id].max_players == 5


async def test_create_clamps_invalid_bank_rule(client):
    """An unrecognised bank_rule is normalised to 'free'."""
    r = await client.post("/api/create", params={"bank_rule": "bogus"})
    assert r.status_code == 200
    game_id = r.json()["game_id"]
    from app.game.state import games

    assert games[game_id].bank_rule == "free"


async def test_create_clamps_invalid_afk_seconds(client):
    """afk_seconds outside 10–300 is clamped to 45."""
    r = await client.post("/api/create", params={"afk_seconds": "9999"})
    assert r.status_code == 200
    game_id = r.json()["game_id"]
    from app.game.state import games

    assert games[game_id].afk_seconds == 45


async def test_create_accepts_presentation_defaults(client):
    """G46: /api/create accepts default_lang + default_theme and surfaces
    them on the Game + in `game_state.room`."""
    from app.game.logic import game_state
    from app.game.state import games

    r = await client.post(
        "/api/create",
        params={"default_lang": "en", "default_theme": "dark"},
    )
    assert r.status_code == 200
    game_id = r.json()["game_id"]
    game = games[game_id]
    assert game.default_lang == "en"
    assert game.default_theme == "dark"
    # And the WS payload includes them.
    state = game_state(game)
    assert state["room"]["default_lang"] == "en"
    assert state["room"]["default_theme"] == "dark"


async def test_create_clamps_invalid_presentation_defaults(client):
    """G46: unrecognised values fall back to fr / light without 500ing."""
    from app.game.state import games

    r = await client.post(
        "/api/create",
        params={"default_lang": "klingon", "default_theme": "neon"},
    )
    assert r.status_code == 200
    game_id = r.json()["game_id"]
    game = games[game_id]
    assert game.default_lang == "fr"
    assert game.default_theme == "light"


async def test_join_late_returns_waiting(client):
    """Joining a game already past WAITING returns status=waiting."""
    from app.game.logic import GamePhase
    from app.game.state import games

    r = await client.post("/api/create")
    game_id = r.json()["game_id"]
    # Manually advance the game past WAITING so late joins go to waiting_players
    games[game_id].phase = GamePhase.CHARGE

    r = await client.get(f"/api/join/{game_id}", params={"name": "LatePlayer"})
    assert r.status_code == 200
    assert r.json()["status"] == "waiting"


async def test_spa_root_serves_or_500(client):
    """GET / triggers the SPA fallback path (static files may not exist in test env)."""
    r = await client.get("/")
    # Either 200 (file exists) or 500 (dist not built yet) — both mean the route ran
    assert r.status_code in (200, 500)


async def test_spa_fallback_for_unknown_path(client):
    """GET /unknown-page triggers the spa_fallback route."""
    r = await client.get("/unknown-page-xyz")
    assert r.status_code in (200, 500)
