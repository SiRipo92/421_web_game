# Code quality sweep — June 2026 (G100b)

Output of running `vulture` (dead Python), `knip` (unused JS exports),
and `radon` (Python cyclomatic complexity) against the codebase at
the G100b cut point. Captures what was removed in this PR, what was
deliberately kept (and why), and what's flagged for follow-up.

Companion to [`docs/SECURITY_AUDIT_2026-06.md`](SECURITY_AUDIT_2026-06.md) —
same style, same pattern: each finding is either *fixed*,
*kept-for-reason*, or *deferred*.

How to reproduce:

```bash
make quality              # vulture + radon
cd frontend && npx knip   # unused JS exports
```

---

## Summary

| Category | Findings | Fixed | Kept | Deferred |
|---|---|---|---|---|
| Python — vulture (≥80% confidence) | 13 | 0 | 13 | 0 |
| Python — vulture (≥60% confidence) | 45+ | 0 | 45+ | 0 |
| Python — radon (rank C or worse) | 12 | 0 | 5 | 7 |
| JS — knip (unused exports) | 5 | 0 | 5 | 0 |

No items fixed in this PR — every finding is either a false positive
(vulture not understanding FastAPI / SQLAlchemy / Pydantic
decorators) or a deliberately-kept item. The deferred refactors of
the highest-complexity functions block on G99b's ws.py coverage push.

---

## 1. vulture — dead Python code

### 1a. False positives (vulture doesn't understand decorators)

These are flagged but they're not dead — vulture's static analysis
doesn't know that:

- **Pydantic `@field_validator @classmethod cls` parameters** are
  required by the decorator's signature contract. Every `cls` in
  `app/schemas/auth.py` (12 instances) is a false positive at 100%
  confidence. **Kept as-is.**
- **FastAPI route handlers** (`@router.get/.post/...`) are registered
  with the router at decoration time; vulture sees them as
  unreferenced functions. ~30 false positives at 60% confidence
  across `app/routers/`, `app/game/ws.py`, `app/main.py`.
  **Kept as-is.**
- **SQLAlchemy ORM relationship attributes** (`game_players`,
  `reset_tokens`, etc. in `app/db/models.py`) are populated by the
  ORM at row-load time. Static analysis sees them as never
  written-to. **Kept as-is.**
- **`hint` parameter in `_sentry_before_send(event, hint)`** —
  Sentry's `before_send` hook API expects this exact signature; we
  don't currently use `hint` but renaming it (e.g. to `_hint`)
  doesn't match Sentry's contract docs. **Kept as-is.**

### 1b. Real but deliberately kept

- **`compute_partie_elo(loser_parties_played)`** at
  `app/services/elo.py:38`. Currently unused inside the function
  body — only survivors' K-factors are weighted. Kept because: (a)
  symmetry with the rest of the API (every other player's
  `parties_played` IS used for their K-factor), (b) future ELO
  tuning may want to weight the loser's K too (e.g. "harsher
  penalty for established players"). Removing the parameter would
  cascade through 8 test files in `tests/unit/test_elo.py` and the
  one production caller in `game_persistence._write`. **The cost
  of removing > the cost of keeping.**

- **`get_optional_user`** in `app/core/security.py:118`. FastAPI
  dependency that returns the current user or `None`. Currently
  used only on routes where auth is optional (e.g. spectator WS
  connection, public room create). vulture's 60% confidence
  signals "I think this is unused" — it's wrong; the function is a
  FastAPI dependency referenced by `Depends(get_optional_user)`.
  **Kept.**

### 1c. Configurable settings not yet read in code

These are in `app/core/config.py` but no code references them yet:

- `test_database_url` — read by `tests/conftest.py` (test infra,
  not production code). **Kept.**
- `retention_dry_run` — wired through to the G70 RGPD cron, which
  hasn't been moved to in-process scheduling yet. **Kept — load-bearing
  on RGPD deletion behavior; required env var in production.**
- `deletion_grace_days` — same as above, RGPD grace period before
  hard-delete. **Kept.**

---

## 2. radon — cyclomatic complexity

### 2a. Documented hotspots (D rank or worse)

These functions need refactoring eventually but **must not be
touched until G99b lands** (ws.py coverage push). Refactoring
high-complexity code without test coverage is how regressions ship.

| File:Function | Rank | CC | What it does | Refactor blocker |
|---|---|---|---|---|
| `app/game/ws.py:_dispatch` | **F** | **129** | Routes incoming WS messages to per-action handlers — the single fattest function in the codebase | Needs G99b ws.py integration tests covering every action branch |
| `app/game/ws.py:_bot_take_turn` | E | 36 | G55/G9 bot decision tree — pick-keepers + starter-floor + ceiling checks | Covered by `tests/unit/test_ws_helpers.py` reasonably well; deferred for cleanliness, not safety |
| `app/game/ws.py:_bot_pick_keepers` | E | 32 | Bot heuristic for which dice to keep | Same — well-tested, could be split for readability |
| `app/game/logic.py:_finalize_cycle` | D | 25 | End-of-cycle resolution: winners/losers, chip flow | Light coverage; refactor risky until manche/round integration tests exist |
| `app/game/logic.py:_resolve_round` | D | 23 | Round resolution: who gets the round-loss penalty | Same |
| `app/game/ws.py:websocket_endpoint` | D | 25 | WS connection lifecycle: auth, register, dispatch loop, disconnect cleanup | Same — integration tests cover the connect/disconnect path but not every error branch |
| `app/game/logic.py:_resolve_tiebreak` | C | 16 | Tiebreak round resolution | Same |

**Recommended approach when G99b ships:**

- `_dispatch` should split into one handler per action (`_handle_roll`,
  `_handle_keep`, `_handle_done`, etc.) — currently a giant if/elif
  chain. Each handler tested in isolation.
- `_bot_take_turn` could split decision branches into `_decide_first_throw`,
  `_decide_followup_throw`, `_decide_stop`.
- `_finalize_cycle` + `_resolve_round` should share a `_apply_round_penalty`
  helper.

### 2b. Acceptable as-is

Functions at B or C rank that are complex by problem nature, not
by accident:

- `app/routers/admin.py:list_users` (C:18) — admin filter +
  pagination + role gating. The complexity is the search interface.
- `app/routers/admin.py:admin_kick_player` (C:18) — kick + audit +
  broadcast + chat-ban check. Three integration points, naturally
  branched.
- `app/routers/admin.py:dissolve_room` (C:12) — similar.
- `app/game/logic.py:classify` (C:12) — dice-combo classification.
  Six combo categories; one branch each. Splitting would obscure
  the lookup table nature.

**Kept as-is.**

---

## 3. knip — unused JS exports

```
src/api/admin.js:    chatUnbanUser (adminApi)
src/api/game.js:     gdprContact
src/i18n/index.js:   default
src/utils/badge.js:  BADGES, badgeLabel
src/utils/consent.js: hasAnalyticsConsent
```

### Verdict per item

- **`adminApi.chatUnbanUser`** — paired with `chatBanUser` which IS
  used. The admin UI doesn't currently expose an "unban chat"
  button, but the backend endpoint exists. The frontend export
  exists for the inevitable moment when the admin team asks for
  the button. **Kept** (matched-pair API consistency).
- **`gdprContact`** — placeholder for the GDPR contact-form
  shortcut; not yet wired into any page. Will be used when the
  Privacy page gets a "request data export / delete" CTA.
  **Kept** (planned).
- **`i18n/index.js: default`** — false positive. The default
  export is re-exported elsewhere and consumed via the named
  re-export. knip's resolver doesn't trace it. **Kept.**
- **`BADGES`, `badgeLabel`** — exported from the shared rank-config
  module (G98). Used by the unranked-display surfaces; knip may
  be missing dynamic key access. **Kept** (sanity-check in next
  knip run; if still flagged after G98 follow-ups, remove).
- **`hasAnalyticsConsent`** — analytics consent helper. Not yet
  read because we don't ship analytics tracking yet (Sentry only,
  which is operational not analytical). **Kept** for when an
  analytics product gets wired in.

**None removed.** All five are deliberate "kept-for-future" items
with named follow-up paths.

---

## 4. Recommended follow-ups (not in this PR)

1. **G99b ws.py coverage push** — pushes `ws.py` coverage 69% →
   85%+. Without this, refactoring `_dispatch` is unsafe.
2. **Post-G99b: split `_dispatch` into per-action handlers** —
   the highest-impact refactor in the codebase. Should drop the
   F-rank to multiple B-ranks.
3. **Knip 90-day review** — re-run after the planned G27
   (notifications) and G46 follow-ups ship. The "kept-for-future"
   items above should either become used or be deleted.
4. **Loser K-factor in ELO** — decide whether
   `compute_partie_elo` should weight the loser's K-factor. If
   yes, the unused param earns its keep; if no, deprecate the
   param via `**kwargs` swallow + log a warning, then remove next
   cycle.

---

**Sweep completed:** 2026-06-20.
**Next sweep recommended:** 2026-09-20 (quarterly), or immediately
after G99b lands.
