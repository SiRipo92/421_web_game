# 421

Multiplayer dice game playable in the browser. Create an account or join as a guest, create or join a game room, and play 421 in real time with friends.

## How to play

421 is a French dice game played in two phases:

- **Charge** — players take turns rolling three dice. The round loser takes chips from the central pool (quantity set by the winning combo). Once the pool is empty, décharge begins.
- **Décharge** — players give chips to the round loser until one player holds all 11 chips. That player loses the set and starts the next one.
- **Sets** — a player who loses two sets is eliminated. Last player standing wins.

**Dice hierarchy (strongest → weakest):** 421 (8pts) › 111 (7pts) › 11x (x pts) › triples › basic figures › everything else (0pts).

The round starter's number of rolls sets the maximum for all other players that round.

## Features

- Real-time multiplayer via WebSocket
- Register/login or play as guest (guests don't appear in rankings)
- ELO rankings with badge tiers: 🎲 Débutant · 🥉 Amateur · 🥈 Confirmé · 🥇 Expert · 👑 Maître
- Full game history per account
- GDPR-compliant: data export, account deletion with 30-day grace period

## Tech stack

| Layer | Tech |
|---|---|
| Backend | Python 3.12, FastAPI, uvicorn |
| Database | PostgreSQL 16, SQLAlchemy 2 async, Alembic |
| Auth | JWT (python-jose), bcrypt (passlib) |
| Frontend | HTML5, Tailwind CSS (CDN), vanilla JS |
| Real-time | WebSocket |
| Container | Docker, docker-compose |

## Local setup

### Prerequisites
- Docker and docker-compose
- (Optional, for running tests locally) Python 3.12, PostgreSQL

### 1. Clone and configure

```bash
git clone https://github.com/SiRipo92/421_web_game.git
cd 421_web_game
cp .env.example .env
```

Edit `.env` and fill in:

```
SECRET_KEY=          # generate with: openssl rand -hex 32
POSTGRES_PASSWORD=   # any password for local dev
```

The other values can stay as-is for local development.

### 2. Start with Docker

```bash
docker compose up --build
```

Open [http://localhost:8421](http://localhost:8421).

> **Note:** The first run applies database migrations automatically via the entrypoint script.

### 3. Run tests locally

```bash
pip install -r requirements-dev.txt
pytest tests/ -v --cov=app
```

Integration tests require a running PostgreSQL instance. Set `DATABASE_URL` in your environment or `.env` to point at it.

## Branching & contributing

```
main      ← stable releases only. PRs from develop, CI must pass.
develop   ← integration branch. All feature PRs merge here.
feature/* ← one branch per feature.
hotfix/*  ← urgent fixes, backmerged to develop automatically.
```

PRs to `develop` and `main` require CI to pass (lint + unit tests + integration tests + ≥ 80% coverage).

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL async URL (`postgresql+asyncpg://...`) |
| `SECRET_KEY` | yes | Random hex string for JWT signing |
| `DEBUG` | no | `true` enables CORS wildcard + `/docs`; default `false` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | no | JWT lifetime; default 30 |
| `ANTHROPIC_API_KEY` | no | Required only for the retention pipeline |
| `RETENTION_DRY_RUN` | no | Set `false` in prod to apply deletions; default `true` |
| `DELETION_GRACE_DAYS` | no | Days before GDPR deletion executes; default 30 |

See `.env.example` for a full template.

## API

Interactive docs available at `/docs` when `DEBUG=true`.

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | — | Create account, returns JWT |
| POST | `/auth/login` | — | Login, returns JWT |
| GET | `/auth/me` | JWT | Current user info |
| GET | `/api/create` | optional JWT | Create a game room |
| GET | `/api/join/{id}` | optional JWT | Join a game room |
| WS | `/ws/{game_id}/{player_id}` | optional JWT | Real-time game connection |
| GET | `/api/rankings` | — | Top 50 players by ELO |
| GET | `/api/profile/{username}` | — | Player profile + game history |
| GET | `/api/gdpr/export` | JWT | Download your data (GDPR Art. 15) |
| POST | `/api/gdpr/delete` | JWT | Request account deletion (30-day grace) |
| GET | `/api/gdpr/status` | JWT | Deletion request status |
| GET/PUT | `/api/profile` | JWT | View / update your profile |

## License

MIT
