# 421 Bistro

[![CI](https://github.com/SiRipo92/421_web_game/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/SiRipo92/421_web_game/actions/workflows/ci.yml)
[![E2E](https://github.com/SiRipo92/421_web_game/actions/workflows/e2e.yml/badge.svg?branch=main)](https://github.com/SiRipo92/421_web_game/actions/workflows/e2e.yml)
[![Coverage](https://img.shields.io/badge/coverage-85%25-brightgreen)](#testing)
[![License](https://img.shields.io/badge/license-source--available-blue)](./LICENSE)

A real-time multiplayer implementation of **421**, the French dice
game traditionally played in bars over an aperitif. Built as a
solo portfolio project to exercise async Python, WebSocket
multiplayer, GDPR-compliant data handling, and full CI/CD.

> Note on the source code license: this repository is published for
> portfolio inspection only. See [LICENSE](./LICENSE) — no copy,
> derive, run, or ML-training rights are granted.

---

## Engineering highlights

Picked for the technical depth they exercise, not just the feature list:

- **Real-time multiplayer over WebSocket.** Per-room broadcast manager with
  reconnect handling, an AFK bot that takes over for idle players, and a
  grace-window "bot handback" pattern so returning humans can rewind the
  bot's last turn ([`app/game/ws.py`](app/game/ws.py)).
- **Async Python end-to-end.** FastAPI + SQLAlchemy async + asyncpg, no
  sync-bridging anywhere in the request path.
- **GDPR-compliant by design.** Self-service `/auth/export` and
  `DELETE /auth/me` with soft-delete + 30-day hard-delete cron, every
  account-affecting event audited in `gdpr_audit_log`.
- **Pre-launch security hardening (G92).** HSTS, CSP, X-Frame-Options,
  Sentry redaction filter, rate limits on auth endpoints, JWT
  token-versioning for password-reset session invalidation,
  gitleaks secret scanning in CI. See
  [`docs/SECURITY_AUDIT_2026-06.md`](docs/SECURITY_AUDIT_2026-06.md).
- **Three layers of automated testing (G99).** ~85% backend coverage
  (pytest + asyncpg integration tests), Playwright E2E for critical
  user journeys, k6 perf scenarios with explicit p95/p99 SLOs.
- **Push-to-main → auto-deploy.** GitHub Actions runs lint + tests +
  E2E + secret scan; on green, `flyctl deploy --remote-only` builds
  the image on Fly's builders and does a rolling restart. Runbook at
  [`docs/DEPLOY_SETUP.md`](docs/DEPLOY_SETUP.md).

---

## Live demo

> Deployed: `https://421bistro.com` *(coming soon — see [`docs/DEPLOY_SETUP.md`](docs/DEPLOY_SETUP.md))*

Screenshots / GIF *(placeholder — to be added before the public flip)*:

```
[ TODO: gameplay GIF — register → join room → roll → win a manche ]
```

---

## Tech stack

| Layer | Tech |
|---|---|
| Backend | Python 3.12, FastAPI, uvicorn, SQLAlchemy 2 async + asyncpg, Alembic |
| Frontend | React 19, Vite 8, react-router 7 (no Tailwind / Bootstrap — vanilla CSS by design) |
| Database | PostgreSQL 16 |
| Auth | python-jose JWT (HS256), bcrypt, Google SSO |
| Email | Brevo transactional API (Jinja2 templates) |
| Observability | Sentry SDK with PII-redaction filter |
| Testing | pytest + pytest-cov + pytest-asyncio, Playwright, k6 |
| CI/CD | GitHub Actions → Fly.io (`flyctl deploy --remote-only`) |
| Container | Docker (multi-stage), docker-compose for local dev |

---

## Architecture

```
                        ┌────────────────────────────┐
                        │   browser (React SPA)      │
                        │   served from same origin  │
                        └──────────────┬─────────────┘
                                       │
                        REST (/api/, /auth/)
                        WebSocket (/ws/<game>/<player>)
                                       │
                        ┌──────────────▼─────────────┐
                        │   FastAPI (uvicorn)        │
                        │   ┌──────────────────────┐ │
                        │   │ in-memory game state │ │  ← single-process for now;
                        │   │   games: dict[...]   │ │     Redis later if needed
                        │   └──────────────────────┘ │
                        └──────────────┬─────────────┘
                                       │
                          asyncpg (async SQLAlchemy)
                                       │
                        ┌──────────────▼─────────────┐
                        │   PostgreSQL 16            │
                        │   users · games · stats    │
                        │   gdpr_audit_log · etc.    │
                        └────────────────────────────┘

       Sentry (errors)        Brevo (email)        Cloudflare (DNS + edge cache)
```

**Why in-memory game state:** the active partie data (current dice, turn
order, AFK timers) lives in a process-local dict, not the DB. Postgres
only holds persistent records (users, finished parties, stats, audit
log). This keeps the WS hot path free of database round-trips at the
cost of single-process limitation — fine for the target traffic. If
that constraint ever binds, Redis-backed pub/sub is a documented
follow-up.

---

## Quickstart

### Docker (fastest)

```bash
git clone https://github.com/SiRipo92/421_web_game.git
cd 421_web_game
cp .env.example .env       # then edit — see docs/SECURITY.md for what each var does
docker compose up --build
```

Open <http://localhost:8421>. Migrations run automatically on first start.

### Native (for development)

Two terminals.

**Terminal 1 — backend:**
```bash
python -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env       # then fill in DATABASE_URL + SECRET_KEY
make dev-backend
```

**Terminal 2 — frontend dev server (hot reload):**
```bash
cd frontend && npm install
make dev-frontend          # Vite proxies /api and /ws to localhost:8421
```

---

## Testing

Three suites, run in CI on every PR. See
[`tests/perf/README.md`](tests/perf/README.md) for the perf details
and [`docs/PERFORMANCE_BASELINE.md`](docs/PERFORMANCE_BASELINE.md)
for the SLO matrix.

| Suite | Tool | Where | Cadence | Threshold |
|---|---|---|---|---|
| Unit | pytest | `tests/unit/` | every PR | ≥ 80% coverage gate |
| Integration | pytest + Postgres | `tests/integration/` | every PR | included in coverage |
| E2E | Playwright | `frontend/tests/e2e/` | every PR | all specs pass |
| Perf | k6 | `tests/perf/` | manual / `perf` label | p95 latency SLOs |

**Run the full backend suite locally:**

```bash
make test       # pytest + coverage report, fails under 80%
```

**Run Playwright locally:**

```bash
cd frontend && npx playwright test
```

The test suite refuses to run without `TEST_DATABASE_URL` containing
the substring `test`, so it can never wipe a production database
by misconfiguration ([`tests/conftest.py`](tests/conftest.py)).

---

## Deploy

Production deploys to [Fly.io](https://fly.io) via GitHub Actions:

1. Push to `main` triggers the `CI` workflow.
2. On success, the `Deploy to Fly.io` workflow fires
   (`workflow_run` event), which calls `flyctl deploy --remote-only`.
3. Fly builds the image on their builders, runs Alembic migrations
   via the entrypoint, and does a rolling restart.

Full setup (Fly account, app creation, secrets, custom domain):
**[`docs/DEPLOY_SETUP.md`](docs/DEPLOY_SETUP.md)**.

---

## Security

- Threat model + ongoing runbook: [`docs/SECURITY.md`](docs/SECURITY.md)
- Pre-launch audit punch list: [`docs/SECURITY_AUDIT_2026-06.md`](docs/SECURITY_AUDIT_2026-06.md)
- Secret scanning runs on every PR via [gitleaks](.github/workflows/secrets-scan.yml)
- Dependency advisories surfaced via `pip-audit` + `npm audit` in CI (non-blocking, see [`ci.yml`](.github/workflows/ci.yml))

Disclosure: please email **security@421bistro.com** rather than
opening a public issue.

---

## Project structure

```
app/                    FastAPI backend
├── core/               config, security helpers, rate limiter
├── db/                 SQLAlchemy models + base
├── game/               in-memory game state + logic + WS handler
├── middleware/         SecurityHeadersMiddleware
├── routers/            HTTP endpoint groups (auth, admin, contact, rankings, rooms)
├── schemas/            Pydantic request/response models
├── services/           afk_eviction, email, game_persistence, elo, username_moderation
└── templates/emails/   Jinja2 transactional email templates

frontend/               React + Vite SPA
├── src/pages/          route-level components
├── src/components/     reusable building blocks
├── src/hooks/          useAuth, useGame, etc.
├── src/api/            fetch wrappers per resource
└── tests/e2e/          Playwright specs

tests/                  pytest suites
├── unit/               pure-function tests
├── integration/        FastAPI test client + Postgres
└── perf/               k6 perf scenarios

alembic/versions/       DB migrations
docs/                   ROADMAP, SECURITY, DEPLOY_SETUP, PERFORMANCE_BASELINE
.github/workflows/      CI, e2e, perf, deploy, secrets-scan
```

---

## How to play 421

421 is a French dice game played in nested cycles. Terminology in
this codebase:

- **Throw** — one roll of the three dice on a player's turn.
- **Manche** — one cycle of the table: every player throws, the
  weakest hand picks up the round-loss penalty.
- **Partie** — a sequence of manches that ends when one player has
  accumulated the threshold number of round-points (default 5).
  That player has "lost the partie."
- **Room** — a persistent table that hosts successive parties. The
  room stays open until the host leaves.

Each manche has two phases:

- **Charge** — chips flow from the central pool (11 chips) to the
  players. Each cycle, the manche loser takes chips from the pool
  equal to the winning combo's value. When the pool empties, play
  flips to discharge.
- **Discharge** — chips pass between players. The manche winner
  hands chips to the loser. A player who drops to 0 chips sits out
  for the rest of the manche. The manche ends when one player
  holds all 11 chips — they take the round-loss penalty.

**Dice hierarchy (strongest → weakest):**
421 (8 chips) › 111 (7) › 11x (x) › triples (2-6) › suites 123/234/345/456 (2) › basic figures (1).

**Bank rules** (set at room creation, not editable mid-partie):

- `free` — the round starter sets the rhythm (1, 2, or 3 throws);
  others must match in equal or fewer throws.
- `sec` — one throw per player during charge, auto-marked done.

Ties at the bottom (or at the top during discharge) are broken by
re-throwing among tied players; the penalty stays the value of the
original winning combo, not the tiebreak combo.

---

## Contributing

This is a solo portfolio project — I'm not accepting external
contributions. If you spot a real issue, feel free to open a bug
report; I'll triage on a best-effort basis.

Internal workflow (for posterity):

```
main      ← stable releases only. Auto-deploys to Fly on push.
develop   ← integration branch. All feature PRs merge here.
feature/* ← one branch per feature; PR back to develop.
fix/*     ← bug fixes; PR back to develop.
chore/*   ← refactors, dep bumps, infra changes.
docs/*    ← docs-only changes.
```

PRs must pass: lint (ruff + ESLint), pytest with ≥ 80% coverage,
Playwright E2E suite, gitleaks scan, no secrets in commits.

---

## License

See [LICENSE](./LICENSE) — viewing-only, all rights reserved. This
repo exists for portfolio review; the source code is not available
for use, modification, redistribution, or ML training.
