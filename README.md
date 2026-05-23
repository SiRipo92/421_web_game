# 421

[![CI](https://github.com/SiRipo92/421_web_game/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/SiRipo92/421_web_game/actions/workflows/ci.yml)

Multiplayer dice game playable in the browser. Create an account or join as a guest, create or join a game room, and play 421 in real time with friends.

## How to play

421 is a French dice game played in two phases:

- **Charge** — players take turns rolling three dice. The round loser takes chips from the central pool (quantity set by the winning combo). Once the pool is empty, décharge begins.
- **Décharge** — players give chips to the round loser until one player holds all 11 chips. That player loses the set and starts the next one.
- **Sets** — a player who loses two sets is eliminated. Last player standing wins.

**Dice hierarchy (strongest → weakest):** 421 (8f) › 111 (7f) › 11x (x f) › triples (2-6f) › suites 123/234/345/456 (2f) › basic figures (1f).

The round starter's number of rolls sets the maximum for all other players that round. Three bank rules are available: `free` (normal 3-roll rhythm), `sec` / `one` (max 1 roll per player during charge).

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

```bash
.venv/bin/pytest tests/ -v
```

Integration tests require a running PostgreSQL instance. Set `DATABASE_URL` in your `.env` to point at it.

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

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | — | Create account (birthdate required, min age 15), returns JWT |
| POST | `/auth/login` | — | Login with email + password; `remember_me` extends TTL to 30 days |
| GET | `/auth/me` | JWT | Current user info |
| POST | `/auth/forgot-password` | — | Send password reset email |
| POST | `/auth/reset-password` | — | Set new password using reset token |
| POST | `/api/create` | optional JWT | Create a game room (accepts `is_public`, `max_players`, `bank_rule`, `afk_seconds`, `afk_bot`, `allow_spectators`) |
| GET | `/api/join/{game_id}` | optional JWT | Join a game room by ID |
| GET | `/api/rooms` | — | List open public rooms |
| WS | `/ws/{game_id}/{player_id}` | optional JWT | Real-time player game connection |
| WS | `/ws/{game_id}/spectate` | optional JWT | Read-only spectator connection |
| GET | `/api/rankings` | — | Top 50 players by ELO |
| GET | `/api/profile/{username}` | — | Player profile + recent game history |
| GET | `/api/gdpr/export` | JWT | Download your data (GDPR Art. 15) |
| POST | `/api/gdpr/delete` | JWT | Request account deletion (30-day grace) |
| GET | `/api/gdpr/status` | JWT | Deletion request status |
| GET/PUT | `/api/profile` | JWT | View / update your profile |

## License

MIT
