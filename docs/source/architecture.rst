Architecture overview
=====================

High-level shape of the system. For runbooks (deploy, security,
performance), see the Operations section.

.. contents::
   :local:
   :depth: 2

System diagram
--------------

::

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

Process model
-------------

The backend is a **single FastAPI process** behind uvicorn. Active game
state (current dice, turn order, AFK timers) lives in a process-local
``dict`` keyed by game id (see :mod:`app.game.state`). Postgres holds
persistent records only — users, finished parties, stats, the GDPR
audit log.

This keeps the WebSocket hot path free of database round-trips at the
cost of single-process limitation: only one uvicorn worker, no
horizontal scaling of game state. Acceptable for target traffic at
launch (<100 concurrent rooms). Redis-backed pub/sub is a documented
follow-up if the constraint binds.

Vocabulary
----------

The French dice game terminology can mean different things in
different variants. The codebase uses:

throw
   One roll of the three dice on a player's turn.

manche
   One cycle of the table: every player throws, the weakest hand
   takes the round-loss penalty.

partie
   A sequence of manches ending when one player accumulates
   ``round_points_to_lose`` (default 5). That player has lost the
   partie.

room
   A persistent table that hosts successive parties. The room stays
   open until the host leaves or an admin dissolves it.

Game lifecycle
--------------

::

    WAITING ──► INITIAL_ROLL ──► CHARGE ──┬──► DECHARGE ──► FINISHED
                                          │
                                          └──► TIEBREAK ──► (back to CHARGE/DECHARGE)

* **WAITING** — host configures the room; players join. Host clicks "start".
* **INITIAL_ROLL** — each player rolls once to determine seat order.
* **CHARGE** — chips flow from the central pool (11 chips) to players.
  Each table cycle, the round loser takes chips equal to the winning
  combo's value. When the pool empties, transitions to DECHARGE.
* **DECHARGE** — chips pass between players. Round winner hands chips
  to round loser. A player at 0 chips sits out for the rest of the manche.
* **TIEBREAK** — tied players re-throw to resolve.
* **FINISHED** — partie is over; results are persisted via
  :func:`app.services.game_persistence.persist_completed_partie`.

Key code paths
--------------

WebSocket handler
   :mod:`app.game.ws` — connection management, dispatch, broadcast,
   AFK timer, bot turn handling.

Game logic
   :mod:`app.game.logic` — pure-function rules: dice classification,
   round resolution, manche/partie transitions.

AFK eviction
   :mod:`app.services.afk_eviction` — when a player has been
   bot-played for ``BOT_TAKEOVER_MAX_MINUTES``, they're evicted from
   the room. Three evictions in 24h triggers a 24h chat-ban
   (anti-grief threshold).

Stats + ELO
   :mod:`app.services.game_persistence` writes the partie row +
   GamePlayer rows + updates PlayerStats; ELO computed by
   :mod:`app.services.elo` (pairwise survivor-vs-loser).

Username moderation
   :mod:`app.services.username_moderation` — two-layer defense:
   regex format check (G96 layer 1) + bilingual blocklist with
   l33t normalisation (G96 layer 2). Offensive handles get
   auto-sanitised; the user sees an in-app banner.

Security hardening
   :class:`app.middleware.security_headers.SecurityHeadersMiddleware`
   sets HSTS, CSP, X-Frame-Options, X-Content-Type-Options,
   Referrer-Policy, Permissions-Policy on every response. CORS is
   locked via ``settings.cors_allowed_origins``. JWT carries a ``tv``
   (token version) claim that lets ``/auth/reset-password``
   invalidate all outstanding sessions.

Data model
----------

See :mod:`app.db.models` for the full set. Key entities:

User
   ``id``, ``username``, ``email``, ``hashed_password``,
   ``email_opt_in``, ``role``, ``token_version``, ``deleted_at``.
   Soft-delete with anonymisation on ``DELETE /auth/me``.

PlayerStats
   ``user_id`` (FK), ``elo``, ``games_played``, ``parties_survived``,
   ``parties_lost``, ``manches_played``, ``manches_lost``,
   ``current_streak``, ``longest_streak``.

Game
   One row per *partie* (not per room).
   ``game_code`` + ``partie_number`` together identify the partie.

GamePlayer
   One row per (partie, player). ``placement`` orders players
   1..N with the partie loser at the end.

GdprAuditLog
   Every account-affecting event — ``account_created``,
   ``account_deleted``, ``afk_eviction``,
   ``username_sanitized``, etc. Retention configured by
   ``moderation_log_retention_days``.

PasswordResetToken
   Single-use tokens for the password-reset flow. SHA-256 hashed
   in storage; the raw token is only emailed.
