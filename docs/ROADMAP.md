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

### G1. AFK-timer reset on every player interaction (not just per-turn)
**Why:** Reported by playtest. Today the AfkBar countdown only resets when the current player changes — but selecting dice (`keep` action) on the backend DOES reset the AFK timer, so the displayed countdown is misleading. The user sees the timer ticking down even though they're actively interacting.
**Scope:**
- Server: emit `afk_started_at` (epoch ms) in `game_state`. Update it whenever `_schedule_afk` (re-)starts the current player's timer (roll/keep/done/tiebreak_roll).
- Client: `AfkBar` reads `state.afk_started_at` + `state.room.afk_seconds` and computes remaining time. Re-mounts naturally when the value changes.
**Acceptance:** A player can hover/click dice for 60+ seconds without the AFK bot taking over.

### G2. Bot-handback flow when a player returns
**Why:** Today, once the AFK bot takes a turn, the cycle advances and the player who came back can't "reclaim" their seat for the current cycle. Per the spec the bot should hold the player's slot for a couple seconds to allow a comeback before fully resolving.
**Scope:** Defer the bot's `advance() → _resolve_round` chain by 2–3 seconds. If the human reconnects via any WS action in that window, abort the bot's pending advance and restore the player's normal turn.
**Acceptance:** Player AFKs through one bot turn, returns mid-cycle, and is back in control immediately for the next throw.

### G3. Auto-validate `done` when the player is at max throws with no choice left
**Why:** If a non-starter has used the starter's max throws and can't roll anymore, the "Done" button is the only action and should fire automatically.
**Scope:** In the `roll`/`keep` handlers, after applying state, check whether `rolls_used >= max_throws_this_round` AND there are no kept-out dice. If so, treat as if the player called `done`.
**Acceptance:** Starter rolls once + clicks done → other players auto-validate after their single throw, no extra click needed.

### G4. Hide the throw counter when there's only one throw to make
**Why:** Showing "0/3 throws" before the starter has set the rhythm is fine; showing "0/1" or hiding altogether once the starter capped the rhythm at 1 makes the UI cleaner.
**Scope:** In `Game.jsx`'s `RollDots`: render only when `max_throws_this_round > 1` OR for the starter when the rhythm isn't yet set.

### G5. Clarify "keep vs reroll" affordance on dice selection
**Why:** Reported. Today clicking a die toggles `reroll[i]` but the visual encoding isn't clear about what each state means.
**Scope:** Add an on-die badge/icon (✓ for "keep", ↺ for "reroll"). Add a one-line legend above the dice row ("Cliquez pour relancer / Click to re-roll").

### G6. Personalize log entries with "Vous" / "You" for the current viewer
**Why:** Reported. "TheWitch donne 1 jeton(s) à Sisi" reads as third-person even when you are TheWitch.
**Scope:** Frontend `formatLogEntries`: when `params.name` (or `winner`/`loser`/`starter`) matches the local `playerId`'s name, substitute the `you_*` i18n string. Could also display contextual flash messages: "You just received 2 chips. Your turn."

### G7. Tied winners in décharge → winner-tiebreak (R1 follow-up)
**Why:** R1 covered tied losers. Exact-same-combo tied winners in décharge still take the "no transfer this cycle" path. Per the spec, they should re-roll to pick the giver.
**Scope:** Mirror the loser-tiebreak code path with `purpose="winner"`. `_resolve_tiebreak` picks HIGHEST rank (giver) instead of lowest. Winner gives `original_penalty` chips to the original loser.

### G9. Smarter AFK bot
**Why:** Reported by playtest. The bot today just rolls once with all three dice and stops, regardless of what the rest of the table is doing. Per the user: it should play like a human strategically — look at the highest score-to-beat in the cycle, re-roll only the dice that don't help, use available throws.
**Scope:**
- Bot reads `current_round_plays` / starter's combo to learn the target.
- If the bot has rolls available and its current combo is lower than the target, it picks which dice to keep based on a simple heuristic (e.g., keep dice that complete a known combo; re-roll the rest).
- Respect `max_throws_this_round`.
- Special-case 421 (8 fiches): always keep dice that contribute to a 421 (a 4, 2, or 1).
- The heuristic should stay simple — no full search; just a couple of rules.

### G10. Side-panel commentary ticker
**Why:** Reported. The right-side log is great for full history; user also wants a left-side "headline" ticker for the most recent meaningful events, where short messages fade in/out as new events arrive.
**Scope:**
- New component `CommentaryTicker.jsx` rendered on the left edge of the game viewport.
- Subscribes to the same `log_events` stream; filters to "headline" events (player_left, tiebreak_start, round_point, match_lost, pool_empty, big combos).
- Renders each event as a short translated phrase ("Players tied — awaiting tiebreak", "Highest to beat: 421 in 1 throw", "X left the room"); auto-fade after ~6 s.
- Headlines specifically include: "X has left", "Players tied, awaiting tiebreak", "Highest score to beat: 421 in N turns".

### G11. Single-player searching modal (open/public rooms)
**Why:** Reported. When only one player remains in a public/open room, the game shouldn't continue alone — pause and wait for new players to join. Spectators should be able to join.
**Scope:**
- Backend: when an active game (CHARGE/DECHARGE/TIEBREAK) drops to one active player, pause: enter a new `GamePhase.WAITING_FOR_PLAYERS` (or reuse WAITING with a flag), suspend AFK timers, stop the match-end check.
- Frontend: SearchingModal that shows "Searching for players…" with the current player count and an auto-start timer once a 2nd player joins.
- New-player path: when a spectator or new joiner comes in, they're added to `players` (not `waiting_players`); game resumes with a fresh banker roll for the new lineup (per the rules: a new game = new banker tirage).
- Alternative simpler option: just dissolve the room when only one player remains, like WAITING phase does today.

### G13. Match-end announcement banner
**Why:** Reported. When a player gets manché (reaches 11 chips), the only visible signal today is one line in the right-side text log — easy to miss. The user wants a clear visual "match is over, X lost" announcement so play feels punctuated.
**Scope:**
- Watch `state.log_events` for the most recent entry with key `log_match_lost`.
- Render a centered fade-in/out banner over the piste: « **X est manché !** Match 1/2 — nouveau match dans 3s… »
- Auto-dismiss after ~4s; click-to-dismiss also.
- Same pattern usable for `log_round_point` (when 2/2 reached, "X prend un point de round").
**Acceptance:** Two-player game; one player reaches 11; the screen shows a centered banner naming them as the manché before the new match starts.

### G14. Layout overhaul — piste sizing, dice placement, log positioning
**Why:** The piste doesn't take up the screen's full visual real estate; the dice area and chip stack sit inside a small circle while the rest of the page has unused white space. The user wants the game to feel "bigger".
**Scope:**
- Rework `Game.jsx`'s main grid:
  - Make the piste 70–80% of the viewport (clamp aspect-ratio: 1).
  - Move the dice + combo display to a fixed bottom-of-piste position, larger, more readable.
  - Right-side log → narrower, full-height column.
  - Left-side commentary ticker (G10) gets a permanent slot.
- Consider a CSS grid: `[ticker 280] | [piste 1fr] | [log 320]` on wide screens, stacked on mobile.
**Acceptance:** On a 1440-wide screen, the piste fills > 60% of the available width, dice are clearly readable without leaning in, log is still visible.

### G15. Visible turn-rhythm + throws indicator
**Why:** Reported. Today the player sees only the `RollDots` (3 small dots) and a small "N lancers restants" line. They don't see explicitly: "the starter set the rhythm at N throws, you're on throw M of N." This makes the bank-rule + free-rythm semantics opaque.
**Scope:**
- Top panel: new compact `RhythmIndicator` showing:
  - Bank rule label ("Sec" or "Libre")
  - For the round starter: "Rythme: libre" while they roll, then "Rythme: N lancers" once they validate.
  - For other players: "Vous: M/N lancers"
- Visible right next to the existing `RollDots`.
**Acceptance:** Non-starter in a "free" room can read the rhythm from the screen without checking the docs.

### G16. Larger / more legible in-piste hints
**Why:** Reported. The dice keep hint (`dice_keep_hint`) is small italic brass on translucent black — hard to read.
**Scope:** Bump to ~0.95rem, slightly heavier weight, more padding, possibly a small "?" icon prefix to anchor the eye.

### G17. Investigate duplicate dev-mode WS connections
**Why:** Backend log shows the same player_id getting `[accepted]` 3–6 times within seconds during local play. Almost certainly React StrictMode running `useGame`'s effect twice on mount + the C2 "kick old connection" close logic. The result is harmless (only the last socket survives) but it spams the log and produces Vite proxy EPIPE/ECONNRESET noise.
**Scope:**
- Confirm StrictMode + double-effect is the cause (check `main.jsx` for `<StrictMode>` wrapper).
- Options: (a) accept it as dev-only noise and document; (b) move WS open/close out of useEffect into a useRef-guarded singleton per (gameId, playerId, token) tuple; (c) keep StrictMode but make the WS connect lazy + idempotent.
- Doesn't affect production behavior, so low-priority.

### G19. (DONE) TopBar responsive layout for 641–835px breakpoint
**Why:** Reported. The TopBar's content (logo, nav links, lang/theme toggles, user menu) gets pushed off-screen to the right between roughly 641px and 835px wide. Mobile burger kicks in below 640px, desktop layout above ~835px, but the in-between range has no specific treatment.
**Scope:**
- Add a media-query band (or use a tighter desktop breakpoint, e.g. `@media (max-width: 900px)`) that:
  - Collapses the lang/theme toggles into a single dropdown OR moves them into the burger drawer at that width.
  - Shortens or icon-only the nav link labels.
  - Or: simply lower the burger threshold from 640 to ~860 so all narrow widths use the drawer.
- Verify on 641 / 720 / 768 / 834 / 900 px.

### G20. Game-screen bottom bar polish + prominent quit
**Why:** Reported. The action-bar text under the piste is small and hard to scan during play; the « Quitter » link is tiny and unremarkable. The host's ⚙ Room rules pill blends in.
**Scope:**
- Bump font-sizes in the action bar (eyebrow + serif lines) by ~15–20%.
- Make the « Quitter » a small but clear button with an icon (door / exit) instead of a tiny link.
- Make the ⚙ Room rules pill visibly button-shaped for the host.
- Possibly split the action bar into a fixed two-row layout on narrow screens so the buttons don't wrap into the player's status text.

### G21. Live play commentary + score-to-beat banner
**Why:** Reported. Even when it's not your turn, you should know what's happening: who's playing, what they rolled, what the highest score to beat is, how many chips are in play. After your own turn you want a friendly summary ("You just lost the manche. You took 3 chips from Player_1. Better luck next time. Your turn to start!").
**Scope:**
- New persistent panel (left of piste, see G14) that shows:
  - "Score à battre : 421 (8 fiches) — Sierra · 2 lancers utilisés"
  - "Banque : N · Pénalité en jeu : Mf"
  - "Vous : votre dernier coup, votre rang dans le tour de table"
- After each cycle, a flash notification ("toast" style, bottom-center or piste-overlay) with a personalized French/English message:
  - "Vous avez perdu la manche · vous prenez 3 jetons de la banque. À vous le rythme !"
  - "Vous avez gagné le tour · Player_1 reçoit 2 jetons."
- Tone: playful, "bistrot" voice. Include the « Bonne chance » / « Tournée du patron » type flourishes.
- Use `state.current_round_plays` + `state.last_round_plays` to build the score-to-beat and player-rank info.
- Personalization rule: when a `params.name` matches the viewer's player name, swap to "vous"/"you".
- Toast should auto-dismiss after ~5s; can be paused on hover.
- This subsumes part of G6 ("Vous/You" personalization) and G10 (commentary ticker).

### G22. French vocabulary review — manche / partie / banque / piste
**Why:** Reported. The French i18n was mixing English-ish vocabulary ("match", "round", "pool", "Tapis") with proper French terms. The proper mapping is:
- "match" (English) → « manche » (féminin: une manche)
- "round" (English) → « partie » (féminin: une partie)
- "pool" (English) → « banque » (la banque)
- "Le Tapis" → « La piste »
**Scope:** Full grep + replace across `i18n/index.js` (FR section), `Game.jsx`, `CreateRoom.jsx`, backend French log strings in `logic.py` / `ws.py`. **Status:** Landed in this batch's vocab commit; remaining cleanup is mostly docstring/comment normalization (R3 follow-up).

### G18. Round-point persistence trigger
**Why:** With no auto-game-end, `_persist_game` only fires for the lone-survivor edge case. Logged-in users' round points accumulated in a session are lost when the room dissolves.
**Scope:** Trigger persistence (1) when a player leaves the room mid-game, (2) when the room dissolves (last player leaves or host migrates). Write `round_points[pid]` to `GamePlayer.round_points` and update `PlayerStats`.

### R1. Rewrite `_resolve_round` for correct one-loser-per-cycle + tiebreak mechanic
**Why:** Commit `5d8bd45` ("rule correctness") shipped tie behavior that doesn't match the actual rules. The real rules: there is **always exactly one loser** per table cycle. Tied losers (or tied top players in discharge when combos are exactly equal) trigger a **tiebreak re-throw** — tied players re-roll three dice in reverse turn order, lowest hand by the combo hierarchy loses, recursive if still tied. The penalty stays the value of the original winning combo. My current code's "all-tied → no transfer" and "tied winners → no transfer" paths are wrong and need removal.
**Scope:**
- Add a new `GamePhase.TIEBREAK` state. Game enters it when `_resolve_round` detects ties at the relevant rank; stays in CHARGE/DECHARGE otherwise.
- New WS action `tiebreak_roll` (one throw of all three dice, no rerolls). Restricted to the tied players.
- New AFK timer variant covers TIEBREAK — bot rolls if a tied player goes idle.
- `_resolve_round` returns early (without resolving) when ties exist; instead it stores the tied set + tiebreak context and broadcasts a TIEBREAK state.
- A new `_resolve_tiebreak` handles the tiebreak roll, picks the loser (or re-enters TIEBREAK recursively if still tied), then applies the penalty using the **original** match's combo value.
- Tied top during CHARGE stays no-op (chips come from bank, no tiebreak needed). Tied top during DECHARGE only triggers tiebreak when combos are exactly identical.
**Acceptance:** Manual game with two players forcing a tie (e.g. via the bot) demonstrates a TIEBREAK round; loser takes the original-combo penalty; recursion handled.
**Dependencies:** None, but item R2 should land alongside or after.

### R2. Match-loss / round-point accounting (replaces `sets_lost`)
**Why:** Current code tracks `sets_lost` and ends the game at 2 set losses (calling it "FINISHED"). The actual rule: a player who reaches 2 match losses takes 1 **round point**, the match-loss counter resets, and play continues. The game has no auto-end.
**Scope:**
- Rename `Game.sets_lost` → `Game.match_losses` (current-round counter; resets when a player hits 2 and takes a round point).
- New `Game.round_points` dict (player_id → int): accumulates across rounds. Persisted to the DB at end-of-session for logged-in users; in-memory only for guests.
- In `_resolve_round` (after `_resolve_tiebreak`), when the manché is determined:
  - increment that player's `match_losses` by 1
  - if `match_losses[pid] == 2`: increment `round_points[pid]`, broadcast a "round_ended" event, reset all `match_losses` to 0, start a new round (which is a new match with reset pool)
- Remove the `GamePhase.FINISHED` transition triggered by `sets_lost >= 2`.
- DB schema: replace `PlayerStats.wins`/`losses` with `round_points_taken` (or similar). Add a `MatchHistory` table tracking each match's manché for the per-match analytics roadmap item 5.
- Alembic migration.
- Frontend: `Profile.jsx` shows round-point count; `Game.jsx` end-of-match overlay shows "manché ! 1/2 → round point" instead of "set lost".
- E1 (single-player auto-end) becomes "pause the match if everyone else left" — no automatic winner declaration.
**Acceptance:** A logged-in user accumulates round points across multiple games; profile reflects the running total; no game forcibly terminates.
**Dependencies:** R1 should land first (the manché determination logic depends on the corrected tie resolution).

### R3. Code-side terminology cleanup
**Why:** The current code uses `round_num`, `_resolve_round`, `_start_new_set`, `set_loser_id`, `sets_lost` — but those map to the user's *match* / *match* / *round* / *match loser* / *match losses*. Mid-rewrite is the cleanest time to rename.
**Scope:** Mechanical renames across `app/game/logic.py`, `app/game/ws.py`, tests. Suggested mapping:
- `round_num` → `match_num`
- `_resolve_round` → `_resolve_table_cycle` (or `_resolve_throw`; pick whichever feels right)
- `_start_new_set` → `_start_new_round` (matches user's "new round starts after a player takes a round point")
- `sets_lost` → see R2
- `log_round_start`/`log_new_set`/`log_set_lost` i18n keys renamed in lockstep
- `current_round_plays`/`last_round_plays` in `game_state` → `current_throw_plays`/`last_throw_plays`
**Acceptance:** No instance of `round` or `set` in the code that refers to user-facing terminology means something different from this doc.
**Dependencies:** Best bundled with R1 + R2 so it's one rename, not several.

---

## Next

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

## Revisions

Past commits that captured incorrect rules — superseded by **R1**, **R2**, **R3** above. The commits themselves stay in history; the corrections are tracked as new Now items.

- `aec1c44` — `/how-to-play` rule docs. The tie-handling and "set lost" wording were wrong. **Revised in this commit** (rewrite under correct vocabulary; see Done below).
- `5d8bd45` — `_resolve_round` "rule correctness". The tie-handling rules (all-tied no transfer / tied winners no transfer / single-survivor auto-end) don't match the actual game. Code stays in place until R1 + R2 land.

## Done

- **2026-05-23** `0483a74` — G19: raised TopBar burger threshold from 640px → 880px so the 641–835 zone no longer overflows. Desktop nav (logo + 3 links + 2 dividers + lang + theme + user menu) needs ~720px minimum, plus padding; anything narrower now uses the drawer. Tablet-portrait lands in the drawer (still very usable).
- **2026-05-23** `efd0be5` — French vocabulary review (G22). Replaced "match" → « manche », "round" → « partie », "pool" → « banque », "Le Tapis" → « La piste » across `i18n/index.js` (FR section), `Game.jsx` piste banner, `CreateRoom.jsx` title, backend French log fallback strings in `logic.py`. English copy unchanged.
- **2026-05-23** `c3ba8f1` — Match-end banner (G13), rhythm indicator (G15), bigger keep-hint (G16).
- **2026-05-23** `ec71db8` — Defensive try/except around WS action dispatch — bug in any handler no longer drops the socket. Extracted `_dispatch` helper.
- **2026-05-23** `9887c80` — Click-to-keep dice (Yahtzee convention) + visible hint on the dark piste.
- **2026-05-23** `292234f` — Corrected re-roll semantics (8a0e948 had them flipped). Click a die = mark for re-roll. No selection + Relancer = re-roll all. Hint copy updated.
- **2026-05-23** `8a0e948` — Initial attempt at re-roll fix + auto-validate + styled leave modal + leave logging. Semantics flipped wrong way; corrected in 292234f. Auto-validate, ConfirmModal, and leave log stand. (flipped semantics: click die to keep; unselected dice re-rolled by default). Auto-validate on max throws so the "Valider" click is no longer required when the player has no choice. Styled in-game `ConfirmModal` replaces `window.confirm` for the leave action. `log_player_left` event surfaced in the game log. Added dice-keep hint text under the dice. Roadmap items G9 (smarter AFK bot), G10 (commentary ticker), G11 (single-player searching modal) captured.
- **2026-05-23** `6d176d0` — TIEBREAK frontend (`TiebreakScreen` in `Game.jsx`, `tiebreakRoll` action in `useGame.js`) + AFK bot for TIEBREAK phase (`_afk_tiebreak_timer`, scheduled by `_schedule_afk`). Added missing i18n keys for `log_match_lost`, `log_round_point`, `log_player_sits_out`, `log_tiebreak_start`, `log_tiebreak_throw`, `log_afk_initial`, `log_round_all_tie`. Always-call `_schedule_afk` after `_resolve_round` so the new phase's timer is set up.
- **2026-05-23** `bef1248` — Backend TIEBREAK phase + `tiebreak_roll` action + `_resolve_tiebreak` (tied losers only; tied winners deferred to G7).
- **2026-05-23** `a905ae3` — match_losses + round_points accounting; no game-end on 2 losses; `GamePlayer.sets_lost` → `round_points` DB migration.
- **2026-05-23** `5246fb5` — Match-end at 11 chips (was at any-player-zero, broken in N-player); sit-out at 0 chips during décharge.
- **2026-05-23** `2048dae` — Rewrote `/how-to-play` and README "How to play" with the correct vocabulary (throw / match / manché / round / round point) and corrected tie behavior (always one loser, tiebreak re-throw, recursive). New "Vocabulary" section at the top of the page.
- **2026-05-23** `4071313` — Room ownership transfer + read-only host settings panel. Added `Player.joined_at` so the leave handler picks the longest-tenured remaining seat (the players list can be reordered by the initial-roll sort, so list position is unreliable). New `RoomSettingsPanel.jsx` modal triggered by a host-only "⚙ Room rules" button in `Game.jsx` — shows the config the creator picked, read-only. 3 new unit tests in `test_host_migration.py`.
- **2026-05-23** `fdd8033` — Cookie consent banner. New `<CookieBanner />` mounted in `App.jsx`; `utils/consent.js` exposes `getCookieConsent`/`hasAnalyticsConsent`/`setCookieConsent`/`clearCookieConsent` for future analytics gating (item 10). Privacy page rewritten with current consent state + a "change my choice" reset button.
- **2026-05-23** `3ec3127` — Strong-password UX. Extracted `pwdChecks`/`isPwdValid`/`pwdStrength` to `utils/pwdChecks.js`; new shared `PasswordChecklist` component with a 3-segment strength meter that's visible on mount (no longer hidden behind `pwdTouched`). Used on Login register tab + ResetPassword.
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
