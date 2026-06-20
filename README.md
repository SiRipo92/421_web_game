# 421

[![CI](https://github.com/SiRipo92/421_web_game/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/SiRipo92/421_web_game/actions/workflows/ci.yml)

Multiplayer dice game playable in the browser. Create an account or join as a guest, create or join a game room, and play 421 in real time with friends.

## How to play

421 is a French dice game played in nested cycles. The terminology matters because the same word can mean different things in different game variants — these are the ones we use:

- **Throw** — one roll of the three dice on a player's turn.
- **Match** — a full bank cycle: starts with 11 chips in the central pool, ends when one player ("manché") holds them all. Chips reset for the next match.
- **Round** — accumulates until any player has lost 2 matches (not necessarily consecutive). That player takes 1 **round point**, the match-loss counter resets for everyone, and a new round begins.
- **Game** — there is no automatic game end. Round points are persistent stats on your profile (or session-scoped for guests). The room stays open until players leave.

Each match has two phases:

- **Charge** — chips flow from the pool to the players. After each table cycle, the round loser takes chips from the pool equal to the winning combo's value. When the pool is empty, play flips to discharge.
- **Discharge** — chips pass between players. The round winner hands chips to the loser. A player who drops to 0 chips sits out for the rest of the match (they're back for the next one). The match ends when one player holds all 11 chips — they're manché.

**Critical:** every match has exactly **one** loser (the manché). Everyone else is a winner of that match. Ties at the lowest hand (or at the top during discharge, when combos are exactly equal) are broken by re-throwing: tied players roll again starting with the most recent and going backward; the lowest hand by the combo hierarchy takes the loss. The penalty stays the value of the original winning combo, not the tiebreak combo.

**Dice hierarchy (strongest → weakest):** 421 (8f) › 111 (7f) › 11x (xf) › triples (2–6f) › suites 123/234/345/456 (2f) › basic figures (1f).

**Bank rules** (set by the room creator at create time, not editable mid-game):
- `free` — the round starter sets the rhythm (1, 2, or 3 throws); others must match in equal or fewer throws.
- `sec` — one throw per player during charge, auto-marked done.

## Features

- Real-time multiplayer via WebSocket
- Register/login or play as guest (guests don't appear in rankings)
- Public room browser — find and join open games without a room code
- AFK bot takeover — idle players are auto-played after a configurable timeout
- Spectator mode — watch any public game in real time (read-only)
- Configurable rooms: max players, bank rule, AFK timeout
- ELO rankings with badge tiers: 🎲 Débutant · 🥉 Amateur · 🥈 Confirmé · 🥇 Expert · 👑 Maître
- Full game history per account
- FR / EN interface toggle, persisted per account
- Password reset via email (Resend)
- GDPR-compliant: data export, account deletion with 30-day grace period

## Tech stack

| Layer | Tech |
|---|---|
| Backend | Python 3.12, FastAPI, uvicorn |
| Database | PostgreSQL 16, SQLAlchemy 2 async, Alembic |
| Auth | JWT (python-jose), bcrypt (passlib), Resend (email) |
| Frontend | Vite 8, React 19, react-router-dom v7 |
| Real-time | WebSocket |
| Container | Docker, docker-compose |

See [`frontend/README.md`](frontend/README.md) for the frontend-specific setup, translation system, and component structure.

## Local setup

### Prerequisites
- Docker and docker-compose
- (Optional, for running without Docker) Python 3.12, Node 20+, PostgreSQL 16

### 1. Clone and configure

```bash
git clone https://github.com/SiRipo92/421_web_game.git
cd 421_web_game
cp .env.example .env
```

Edit `.env` and fill in at minimum:

```
SECRET_KEY=          # generate with: openssl rand -hex 32
POSTGRES_PASSWORD=change_me
DATABASE_URL=postgresql+asyncpg://app:change_me@db:5432/fourtwentyone
RESEND_API_KEY=      # from resend.com — required for password reset emails
APP_URL=http://localhost:8421
```

### 2. Start with Docker

```bash
docker compose up --build
```

Open [http://localhost:8421](http://localhost:8421).

> **Note:** `docker compose up` starts both the PostgreSQL database and the app. Migrations run automatically on first start via the entrypoint script.

> **Docker Hub:** `docker pull siripo92/421-game:latest` — published on every merge to `main`.

### 3. Run locally without Docker

**Terminal 1 — backend:**
```bash
python -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env  # fill in DATABASE_URL, SECRET_KEY
make dev-backend
```

**Terminal 2 — frontend dev server (with hot-reload):**
```bash
cd frontend && npm install
make dev-frontend    # proxies /api and /ws to localhost:8421
```

Or build the frontend for production serving:
```bash
make build-frontend  # outputs to static/dist/
```

### 4. Run tests locally

The test suite **must not** run against your production database — integration tests create users via `/auth/register` and would otherwise pollute the live `users` table.

**One-time setup** (per dev machine):

1. Connect to your local Postgres in **pgAdmin 4** (or `psql`).
2. Right-click your server → **Create → Database…** with:
   - **Database**: `fourtwentyone_test`
   - **Owner**: `app` (or whichever role owns the production DB)
3. Add the connection string to your `.env`:
   ```
   TEST_DATABASE_URL=postgresql+asyncpg://app:<password>@localhost:5432/fourtwentyone_test
   ```
4. Apply the schema to the new database:
   ```bash
   make test-db-migrate
   ```

**Run tests:**

```bash
.venv/bin/pytest tests/ -v
# or
make test
```

`tests/conftest.py` swaps `DATABASE_URL` → `TEST_DATABASE_URL` before any app module loads. Two safety guards refuse to run:

- if `TEST_DATABASE_URL` isn't set in `.env`
- if its value doesn't contain the substring `test`

That way an accidentally-misconfigured `.env` can never wipe your production users.

## Branching & contributing

```
main      ← stable releases only. PRs from develop, CI must pass.
develop   ← integration branch. All feature PRs merge here.
feature/* ← one branch per feature.
hotfix/*  ← urgent fixes, backmerged to develop automatically.
```

PRs to `develop` and `main` require CI to pass. The pipeline runs four jobs in sequence:

1. **Lint** — ruff (Python) + ESLint (frontend)
2. **Unit tests** — fast, no database required
3. **Integration tests + coverage gate** — real PostgreSQL, Alembic migrations, full test suite, ≥ 80% coverage enforced
4. **Docker build & push** — multi-stage image pushed to `siripo92/421-game` on DockerHub (push events only, not PRs)

Pushes to `main` tag the image `:latest` + `:<sha7>`. Pushes to `develop` tag `:develop` + `:<sha7>`.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL async URL (`postgresql+asyncpg://...`) |
| `SECRET_KEY` | yes | Random hex string for JWT signing |
| `RESEND_API_KEY` | yes (prod) | Resend API key for password reset emails |
| `APP_URL` | yes (prod) | Public base URL, used in reset email links |
| `DEBUG` | no | `true` enables CORS wildcard + `/docs`; default `false` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | no | JWT lifetime in minutes; default 30 |
| `REMEMBER_ME_EXPIRE_DAYS` | no | Extended JWT lifetime when remember_me=true; default 30 |
| `RESET_TOKEN_EXPIRE_MINUTES` | no | Password reset link TTL; default 60 |
| `SENTRY_DSN` | no | Sentry DSN for error tracking |
| `ANTHROPIC_API_KEY` | no | Required only for the retention pipeline |
| `RETENTION_DRY_RUN` | no | Set `false` in prod to apply deletions; default `true` |
| `DELETION_GRACE_DAYS` | no | Days before GDPR deletion executes; default 30 |
| `GOOGLE_CLIENT_ID` | no | Google OAuth client ID for Google Sign-In |

See `.env.example` for a full template.

## API

Interactive docs available at `/docs` when `DEBUG=true`.

### Auth (`app/routers/auth.py`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | — | Create account (birthdate required, min age 15). Returns JWT + `theme_pref`/`lang_pref`. |
| POST | `/auth/login` | — | Email + password. `remember_me` extends token TTL to 30 days. |
| POST | `/auth/google` | — | Google SSO callback (ID token). New users may need `/auth/google/complete`. |
| POST | `/auth/google/complete` | JWT (provisional) | Finish profile after SSO (username + birthdate). |
| POST | `/auth/forgot-password` | — | Email a one-time reset link. |
| POST | `/auth/reset-password` | — | Set new password using reset token. |
| GET | `/auth/me` | JWT | Current user — role, strikes, ban state, `lang_pref`, `theme_pref`. |
| PATCH | `/auth/me` | JWT | Update username / `lang_pref` / `theme_pref`. |
| DELETE | `/auth/me` | JWT | Soft-delete account (RGPD; hard-delete `DELETION_GRACE_DAYS` later). |
| GET | `/auth/export` | JWT | RGPD Art. 15 data export — account, stats, games, audit log. |

### Game rooms (`app/game/ws.py`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/create` | optional JWT | Create a room. Body params: `is_public`, `max_players`, `bank_rule`, `afk_seconds`, `afk_bot`, `allow_spectators`, `default_lang`, `default_theme`. |
| GET | `/api/join/{game_id}` | optional JWT | Join a room as player or join `waiting_players` if past WAITING. |
| GET | `/api/rooms` | — | List currently open public rooms. |
| WS | `/ws/{game_id}/{player_id}` | optional JWT (query param) | Real-time player connection. Send `{action, ...}` JSON frames. |
| WS | `/ws/{game_id}/spectate` | optional JWT (query param) | Read-only spectator stream of game state. |

WebSocket actions (sent by client over the player WS): `start`, `leave`, `kick`, `initial_roll`, `roll`, `keep`, `done`, `tiebreak_roll`, `update_room_rules` (host-only — G45 partie-boundary rule edits).

### Rankings & profile

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/rankings` | — | Top 50 players by Elo. |
| GET | `/api/profile/{username}` | — | Public profile + recent game history. |

### Admin (`app/routers/admin.py`, gated by `require_moderator` / `require_admin`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/admin/dashboard-summary` | moderator | Counts: total users, active bans, chat bans, strikes, inbox stubs. |
| PATCH | `/api/admin/users/{id}/role` | admin | Promote / demote a user. Audited in `gdpr_audit_log`. |
| GET | `/api/admin/games/{id}/bot-decisions` | moderator | Per-throw AFK-bot decision trace for offline review (G55). |

### Public utility

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/contact` | — | Contact form (rate-limited 3/hour). Returns `{detail: {code, message}}` on 502 so the frontend can map specific errors. |
| GET | `/api/policy-config` | — | Env-driven legal/policy timings (inactivity, deletion grace, breach window, audit retention). Rendered into the Privacy + Terms pages. |
| GET | `/healthz` | — | Liveness probe. |

## License

MIT
