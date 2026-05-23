# 421 Bistro — Roadmap

Living checklist of planned work. The intent is to capture everything we've discussed so nothing slips, group items by readiness, and keep one source of truth for "what's next." Update an item's status when picking it up; move it down to **Done** when it ships.

Conventions:
- **Now** = actively in flight or up next
- **Next** = high-priority queued; ready to start after Now
- **Later** = planned, but needs design or depends on Next items
- **Maybe** = ideas worth considering; not committed
- **Done** = shipped (link to PR / commit when known)

Each item has: *Why* (motivation), *Scope* (what changes), *Acceptance* (how we know it's done), and *Dependencies* (if any).

---

## Now

### 3. Cookies consent banner (CNIL / GDPR)
**Why:** The site uses `localStorage` for the auth token and theme/lang prefs. Per CNIL guidance, even functional storage benefits from a transparent notice; if we add any analytics later we'll need a proper consent flow already in place.
**Scope:**
- New component `frontend/src/components/shared/CookieBanner.jsx`: fixed-bottom banner with "Accept" / "Reject non-essential" / link to `/privacy`. Stores acceptance in `localStorage` (`cookie_consent: "accepted" | "rejected" | <timestamp>`).
- Mount in `App.jsx` so it appears on every page until dismissed.
- Today there are *no* non-essential cookies, so "reject" is a no-op — but the flag is honored when we add analytics (item 9).
- Update `Privacy.jsx` to reference the banner and what each category covers.
- i18n strings (fr + en).
**Acceptance:** First-time visitor sees the banner; clicking either option hides it permanently for that browser; link to `/privacy` works.
**Dependencies:** None.

---

## Next

### 4. Persistent room ownership + transfer when host leaves
**Why:** Currently the host can change room config only at create time and via the WS layer; if the host leaves during `WAITING`, the room dissolves. The spec is: rules are set once at create time; if the host leaves while the room is active, ownership transfers to the **longest-tenured remaining player** (not just `players[0]`). Public rooms also need an explicit `max_players` field — confirmed currently present (1–5) but should default sensibly and be required in the UI.
**Scope:**
- `app/game/ws.py` leave handler: when host leaves *after* the game has started, transfer `host_player_id` to the player with the earliest join timestamp. Today we just take `game.players[0].id`, which is correct *if* players are appended in join order — verify and add a comment, or add a `joined_at` timestamp to `Player` for explicitness.
- Host-only "Room settings" panel: a slide-out or modal accessible from the in-game top bar (host only) that shows current `bank_rule`, `afk_seconds`, `allow_spectators`, `max_players`. The spec says these are set once — so the panel is **read-only** for the host. Add a "Leave room" action.
- Frontend: new component `RoomSettingsPanel.jsx`; trigger button visible only when `state.room.host_player_id === playerId`.
- Public rooms: `CreateRoom.jsx` already exposes `max_players` (2–5). Verify the validation message is clear; ensure it's surfaced in `Lobby.jsx`'s room card.
**Acceptance:**
1. Host leaves an active game → next-longest-tenured player becomes host; broadcast reflects the change.
2. Host sees a "Room rules" button in the game UI that opens a read-only panel showing all config values.
3. Lobby card for a public room shows `max_players`.
**Dependencies:** None. (B5/E2 leave-handler work from commit `82d4731` already covers most plumbing.)

### 5. Per-match win/loss tracking + achievement badges
**Why:** Stats today (`PlayerStats.elo`, `games_played`, `wins`, `losses`) update only at game end via `_persist_game`. The user wants per-**match** and per-**round** tracking too, and badges that unlock at thresholds (first win, 10 wins, perfect game, etc.).
**Scope:**
- Decide granularity: a "match" in 421 is a set (best-of-two sets per game). Add `sets_played` / `sets_won` to `PlayerStats`, or a new `MatchHistory` table with one row per set.
- Define badge taxonomy. Initial list:
  - 🎲 **Premier verre** — first game played
  - 🏆 **Première victoire** — first game won
  - 🔥 **Sur une lancée** — 5 wins in a row
  - 👑 **Habitué** — 25 games played
  - 🎯 **421 !** — rolled a 421 combo
  - 🩹 **Comeback** — won after losing a set first
- Backend: `app/services/badges.py` with rule definitions; awarded inside `_persist_game` and a new `_persist_match` hook. New table `UserBadge(user_id, badge_key, awarded_at)`.
- Migration via the `make-migration` skill.
- Frontend: badges show on `Profile.jsx` (already has a badge stub via `utils/badge.js` — that's the **rank** badge, not achievement; rename one of them to avoid confusion). New `BadgeWall.jsx` component.
**Acceptance:** Winning a game updates `wins` and any newly unlocked badges; the profile page shows the badge wall; logged-out users see no badges.
**Dependencies:** Schema migration (alembic).

### 6. Update existing project documentation
**Why:** README + frontend README are out of date with the recent auth/contact/game-logic work. Some onboarding docs would help future contributors.
**Scope:**
- `README.md`: add section on running the dev stack (docker-compose + npm dev server + alembic), env vars (`SECRET_KEY`, `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `RESEND_API_KEY`, `CONTACT_EMAIL`, `SENTRY_DSN`, `ANTHROPIC_API_KEY`), CI overview, how to add a migration.
- `frontend/README.md`: list pages/routes, i18n contribution flow, theme tokens.
- New `CONTRIBUTING.md`: branch convention, commit-message style (`feat:` / `fix:` / `chore:` we've been using), how to run the lint + test gates locally.
**Acceptance:** A new contributor can clone the repo and run the full stack in under 15 minutes.
**Dependencies:** None. Probably do this *after* item 7 (Sphinx) so README can link to hosted docs.

### 7. Sphinx + Read the Docs documentation site
**Why:** Project has grown to the point where a hosted, versioned doc site is worth the setup cost. Lets us autogenerate API reference from FastAPI routes, link from the public site, and version docs alongside releases.
**Scope:**
- `docs/` Sphinx scaffold with `conf.py`, `index.rst`, MyST parser so we can write Markdown.
- Extensions: `sphinx.ext.autodoc`, `sphinx.ext.napoleon`, `autodoc_pydantic` (for the schemas), `myst_parser`, `sphinx_rtd_theme` (or Furo).
- Pages to write:
  - **Architecture** — request flow, WS state machine, DB schema
  - **Game rules** — same content as `/how-to-play` but more formal
  - **API reference** — autogenerated from `app/routers/*.py` + `app/schemas/*.py`
  - **Operations** — deploy, env vars, migrations, CI
- `.readthedocs.yaml` config; connect the GitHub repo to readthedocs.org.
- CI job: `sphinx-build -W -b html docs/ docs/_build` to fail PRs that break docs.
**Acceptance:** `https://421-bistro.readthedocs.io` (or similar) renders the docs; CI rebuilds on every push.
**Dependencies:** None; ideally before item 6 (README) so README can link.

---

## Later

### 8. In-room chat with AI moderation
**Why:** Public rooms benefit from chat for vibe; need toxic-content filtering and a graduated enforcement model.
**Scope:**
- WS subprotocol for chat: new actions `chat_send`, `chat_history`. Rate-limit per player.
- Moderation pass: Claude Haiku content classification (same pattern as avatar moderation in `app/routers/auth.py::_moderate_image`). Classify each message as safe/warn/block.
- Persistence: `ChatMessage` table (game_id, user_id, body, sent_at, moderation_verdict). Per-game retention (purge on game end).
- Frontend: chat panel in `Game.jsx` toggle; basic message UI; redaction display for blocked messages.
**Acceptance:** Players can chat; obviously toxic messages are blocked with a placeholder; moderator dashboard shows incidents.
**Dependencies:** Item 9 (enforcement system) handles repeat-offender behavior.

### 9. Player enforcement (warn / temp-ban / perm-ban)
**Why:** Repeated chat violations or game-rule abuse need consequences without ops doing it by hand.
**Scope:**
- `Enforcement` table: `user_id`, `kind` (warn/temp/perm), `reason`, `expires_at`, `issued_by` (system or admin uuid).
- Service `app/services/enforcement.py`: `record_violation(user_id, kind)`; thresholds (e.g., 3 warns → 24h ban; 3 temp bans → permanent).
- Auth middleware checks for active bans on login + WS handshake.
- User-facing: locked-out page explains reason and expiry. Email notification via Resend.
- Admin/moderator role flag in `User`; admin dashboard at `/admin` listing recent violations.
**Acceptance:** A user who triggers the threshold can't log in until their ban expires.
**Dependencies:** Item 8 supplies the violation source; admin auth path needs design.

### 10. Frontend analytics (opt-in)
**Why:** Useful to understand drop-off in registration / game funnels. Must respect the cookie banner (item 3) — only fire when the user accepts non-essential cookies.
**Scope:** Plausible or Umami (privacy-friendly, no PII). Gate the script load behind `localStorage.cookie_consent === "accepted"`.
**Acceptance:** Analytics fires only after consent; declining users have zero analytics network calls.
**Dependencies:** Item 3 (cookies banner) must ship first.

### 11. WS rate limiting per connection
**Why:** Item H1 already caps message size; we don't yet rate-limit action frequency. A malicious client could spam valid actions.
**Scope:** Token bucket per (game_id, player_id) — e.g., 20 messages/second. Drop with `{error: "rate_limited"}`.
**Acceptance:** Stress-spamming a connection results in dropped messages, not server CPU spike.
**Dependencies:** None.

---

## Maybe

### 12. Game replay / spectator history
Persist round-by-round state for finished games; let users replay or review their plays. Requires schema for `GameRoundLog`. Nice-to-have.

### 13. Tournament / ladder mode
Bracketed multi-game tournaments with seeding by Elo. Adds substantial UI + state surface; defer until core gameplay is stable.

### 14. Mobile app shell (React Native / Capacitor)
The web frontend is responsive; a native shell would enable push notifications for game invites. Out of scope until web traction.

---

## Done

- **2026-05-23** _(pending SHA)_ — Strong-password UX. Extracted `pwdChecks`/`isPwdValid`/`pwdStrength` to `utils/pwdChecks.js`; new shared `PasswordChecklist` component with a 3-segment strength meter that's visible on mount (no longer hidden behind `pwdTouched`). Used on Login register tab + ResetPassword.
- **2026-05-23** `aec1c44` — `/how-to-play` rule documentation: objective, banker roll, starter rotation, charge/décharge, bank rules, tie handling, AFK bot, winning the game. Also fixed `how_to_play_eyquitebrow` typo in the English locale.
- **2026-05-23** `bf9f77b` — Removed `bank_rule="one"` (duplicate of `"sec"`)
- **2026-05-23** `82d4731` — WS hardening (player_id auth, dup-connection kick, atomic join, msg size cap, JSON parse safety, leave handler cleanup, INITIAL_ROLL AFK)
- **2026-05-23** `5d8bd45` — Game-logic rule correctness (starter rotation, tie handling, initial-roll lowest-tie, single-survivor auto-end)
- **2026-05-23** `cd281d6` — CI pipeline speed-ups (pip cache, merged unit+integration, main-only docker push)
- **2026-05-23** `04de09e` — Tests for new auth/contact endpoints (coverage back over 80%)

---

## Process

When picking up an item:
1. Move it to **Now** if it isn't already.
2. Create a Plan-mode plan file or AskUserQuestion to confirm intent before coding.
3. Branch off `develop`, ship behind logical commits, push.
4. Update this file: status → **Done**, add the commit SHA.

When adding a new idea: drop it in **Maybe** with a one-line *Why*. Promote it once we've thought through scope.
