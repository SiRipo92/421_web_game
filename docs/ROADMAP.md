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

### G20. (DONE) Game-screen bottom bar polish + prominent quit
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

### G23. (DONE) Self-play toast after auto-validate
**Why:** When a player's turn auto-validates (rolls_left hit 0, or sec/max throws reached), they don't get a "you sent X to the table" summary — they just see the next player start. Reported as confusing.
**Scope:**
- New frontend `SelfPlayToast` component: pops bottom-right of the piste when the local player's turn just transitioned from `!done` → `done` (or the cycle advanced past them).
- Content: `"Vous avez joué [4-2-1] → 421 (8 fiches). À X de jouer."` — playful bistrot voice.
- Triggers off log_events for self (`log_turn` with name === viewer's name).
- Auto-dismiss ~4s, click to dismiss.
- Subsumes part of G21.

### G24. (DONE) Host: kick AFK player
**Why:** Reported. When a player goes AFK and the bot keeps playing for them, the host wants the option to free the seat for someone else instead of waiting through the timeout cycle.
**Scope:**
- Backend: new WS action `kick` accepting `target_id`. Validates the sender is `game.host_player_id` AND target isn't the host themselves. Treats it like the target's `leave` action (cleanup state, broadcast, close the target's WS).
- Frontend: small kick button next to each player strip when (viewer is host) AND (target's connected state has been false for ≥ N seconds OR the bot has played their last cycle). Confirm modal.
- Log: `log_player_kicked` event ("X a été expulsé par l'hôte.").

### G32. Host: ban player from this room
**Why:** G24 lets the host kick a disruptive player, but the kick is one-shot — nothing prevents them from rejoining a second later. The host needs the option to permanently exclude a specific user from this specific room.
**Scope:**
- Backend: new WS action `ban {target_id, reason?, report?: bool}` (host-only, can't ban self). Behaves like `kick` (drops player from `players`, closes their WS, runs the same cleanup) AND records the ban.
- New table `RoomBan(id, game_code, banned_user_id, banned_ip, banned_by_user_id, reason, report, created_at)`. Indexed on `(game_code, banned_user_id)` and `(game_code, banned_ip)`.
- WS join handler: before accepting a connection, look up `RoomBan` for `(game_code, joining_user_id)` AND `(game_code, joining_ip)`. If either matches an active row → send `{type: "join_rejected", reason: "banned"}` and close.
- Frontend: in the per-player controls (next to G24's ✕ kick), add a 🚫 ban button (host-only). ConfirmModal explains the consequence — « Cette personne ne pourra plus rejoindre cette partie. » Optional checkbox: « Signaler ce joueur » triggers the G33 escalation in the same flow.
- KickedOverlay variant for banned-rejoin attempts: « Vous avez été banni de cette partie. »
- New `log_player_banned` journal event.
- Backend tests: ban-then-rejoin-rejected (same account), ban-while-not-host-rejected, ban-self-rejected, banned-IP-rejection (with G35), ban survives WS reconnect.
**Acceptance:** Host bans a player → that player's WS closes → re-joining (same account or same IP, per G35) returns a clear rejection. Host's settings panel lists current bans with an "Unban" affordance.
**Dependencies:** None — extends G24's kick plumbing. Foundation for G33 + G35. Alembic migration for `RoomBan`.

### G25. Persistent manché / round-points indicators on player strip
**Why:** Reported. Today nothing visually flags which players have lost matches/rounds during the current session — the banner pops briefly then disappears.
**Scope:**
- PlayerStrip + PisteSeat: render two small pip rows per player:
  - `match_losses` (0–1 — resets to 0 when 2 hit and round-point taken)
  - `round_points` cumulative count
- Use icons (e.g., 💀 for manches, 🏷️ for round points) or compact "M:1 · P:0" text.
**Status:** Landing in the current commit batch.

### G26. Profile: site language follows account preference at login
**Why:** Reported. Today the site language is held entirely in `LangContext` (localStorage). The logged-in user's `lang_pref` exists in the DB but doesn't drive the site language at all — change FR→EN in the profile, the UI stays French until you also flip the TopBar toggle. Partially fixed in the lang-update commit (post-save, we now call `setLang` to sync), but on initial login we still ignore the persisted preference.
**Scope:**
- When `useAuth` first fetches `/auth/me` and gets a `lang_pref`, dispatch into `LangContext.setLang` once. Guard against overwriting the user's mid-session toggle by only doing it on first login of the session.
- When the lang toggle flips while logged in, optimistically write to localStorage AND fire `updateMe({lang_pref})` in the background so the server's copy stays in sync (so a fresh session in another browser starts in the right language).

### G27. Notifications inbox
**Why:** Captured for future. User wants a place in the profile to see in-app notifications (friend request, game invite, "Sierra joined a public room", etc.).
**Scope (sketch only):**
- New table `Notification(user_id, kind, payload jsonb, read_at, created_at)`.
- Endpoints: `GET /api/notifications`, `POST /api/notifications/{id}/read`, WS push channel on the user's auth WS (or SSE).
- Profile page: notifications bell with unread count + a panel that lists recent.
- First populators: G28 (friends) and G29 (invites).

### G28. Friends / follow system
**Why:** Captured for future. User wants the ability to follow other accounts to see what they're up to and quickly invite them to a game.
**Scope (sketch only):**
- Table `Follow(follower_id, followee_id, created_at)`. Both-direction or one-way? Spec'd as "follow" (one-way), but a mutual-follow shortcut might be nice (think "friends").
- Endpoints: `POST /api/follow/{user_id}`, `DELETE /api/follow/{user_id}`, `GET /api/me/following`, `GET /api/me/followers`.
- UI: follow button on `/profile/{username}`; followers/following count + list on own profile.
- Privacy: respect a future `User.profile_visibility` setting (defer).

### G31. 3D dice animation + organized combo banner + sound
**Why:** The current dice are flat 2D images that snap to a new value with no animation, and the player has to scan the values and remember the hierarchy table to know what they rolled (was 1-1-3 worth 3 chips? a basic? 11x?). User wants a more immersive feel — visible dice tumble, a sorted result banner that names the combo, and a "shake" sound before the throw so it feels like real dice in a hand.
**Scope:**
- **3D dice rendering.** Two options to weigh during research:
  - CSS 3D transforms (lightweight, no extra deps; ~12 keyframes per face): faster to ship, narrow visual ceiling.
  - Three.js or react-three-fiber (~150 KB gzip): richer physics, more polish, larger bundle.
  - Decision criterion: visual quality vs. bundle size budget. Default lean: CSS 3D first; promote to Three.js only if the look falls short.
- **Adaptive sizing.** On mount of `Game.jsx`, measure the piste container via a `ResizeObserver` and pass dimensions down to the dice area so the throw fills the available space instead of being capped at 600×600 (this also helps G14). Re-measure on viewport resize.
- **Animation flow per throw:**
  1. **Shake** (~1 s): kept dice slide to a side panel inside the piste; remaining dice cluster centre, shake in place with audio loop.
  2. **Throw** (~600 ms): dice tumble across the piste in 3D, settling to their final value.
  3. **Banner** (~3 s, then collapses): organized post-roll banner above/below the dice with the dice sorted high → low and the combo name + chip value pulled from `classify()` server-side (already in `state.players[me].turn.combo` / `.fiches`). Example: « **4-2-1** · 421 · 8 fiches ».
- **Audio.**
  - Three short clips: `shake.mp3` (loop), `throw.mp3` (one-shot), `settle.mp3` (one-shot).
  - Use Web Audio API or `<audio>` tags; prefer Web Audio for precise scheduling.
  - Per-user toggle in localStorage (`sound_enabled: true | false`), default `true`.
  - Sound toggle exposed in the TopBar (next to theme toggle) AND in the Room settings panel.
  - Respect `prefers-reduced-motion` and `Mute` audio API hint to default off if the browser/OS suggests.
- **Selected-dice layout.** When the player clicks a die to keep it (current click-to-keep semantics): the kept die animates to a side rail inside the piste (top-right by default). The remaining unkept dice cluster centre for the next throw. After the throw, dice that were kept return to the inline display.
- **Accessibility:** keep `<Die>` keyboard-focus + Enter/Space behaviour intact even when 3D. Animation skipped entirely when `prefers-reduced-motion: reduce`.
- **Performance:** all animation runs on `transform` + `opacity` (GPU-composited). No layout thrashing. Pause animation when the tab is hidden (`document.visibilityState`).

**Research first.** This item carries enough unknowns (3D library choice, audio asset sourcing, mobile perf) that the first PR should be a research note + tiny prototype, not the production drop. Split it: G31a (research + prototype) → G31b (production implementation).

**Dependencies:** ideally lands alongside G14 (piste sizing) since both touch the piste container measurement. G16 (hint text) and G15 (rhythm indicator) won't fight with the new dice but their placement might need tweaking once the dice area grows.

### G30. External invite delivery — email / SMS / WhatsApp link
**Why:** Beyond the in-app friend invites (G29), the user wants to share a private-room join link via outside channels. "Tap to copy a link", "send via email", "send via WhatsApp" — invitee clicks the link, lands on the room with the code pre-filled, joins.
**Scope (sketch only):**
- Backend: `POST /api/games/{game_id}/share` returns a one-shot signed link `https://APP_URL/join?code=ABC123&t=<signed-token>` that auto-fills the join screen. Optional `via=email|sms|whatsapp` lets the server send the link directly (Resend for email, Twilio/Vonage for SMS, WhatsApp Cloud API for WA — each gated by env keys).
- Email template: same Resend pipeline as password reset. Subject line includes inviter's name.
- WhatsApp / SMS: open the user's native share intent client-side via `window.open('https://wa.me/?text=' + ...)` and `sms:?body=...` URI as no-server-cost fallbacks; full server-side delivery is opt-in (env-gated).
- Per-room rate limit on share API to prevent spam.
- UI: existing « Inviter » in the waiting room opens a small modal with copy-link + share-via buttons.
- Depends on G29 for the join-screen plumbing; can ship the copy-link variant independently first.

### G29. Invite friends to play
**Why:** Captured for future. User wants to send a game invite to a follower from inside the room ("Inviter") and have them get a notification + one-tap join.
**Scope (sketch only):**
- New `GameInvite(from_user, to_user, game_id, code, created_at, status)` row keyed by code (with TTL).
- Backend: `POST /api/games/{game_id}/invite` (host-only, must be following or mutual), `POST /api/invites/{code}/accept`.
- Notification created on send; accepting fires a `/api/join/{game_id}` and navigates the invitee into the waiting room.
- Email backup if invitee is offline + opted in.
- Depends on G27 (notifications) and G28 (friends).

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

### G33. Host: report player → escalate to global chat-ban
**Why:** A serial offender shouldn't only be banned from one room. The host needs to **report** a banned player to platform moderation, and a verified report should remove that player's ability to chat in any room — but they keep play access. We don't lock people out of the *game*; we lock them out of *social surfaces* (chat, friends, public-room discoverability). This matches what we already do for image moderation on avatars: filter the harmful surface without account-banning the user outright.
**Scope:**
- The `RoomBan` table (G32) already carries a `report: bool` flag. When set, also create a `ModerationReport(id, reporter_user_id, reported_user_id, room_code, category, reason_text, ip_at_offense, created_at, verdict, verdict_at, verdict_by, legal_review)` row.
- `category` is a fixed enum picked by the host: `harassment | hate_speech | sexual | csam_suspect | spam | cheating | other`. Same taxonomy as the AI classifier in G34. Translated labels via i18n.
- Three verdict paths:
  1. **Auto-escalate** — categories `csam_suspect` and `hate_speech` (host-flagged) skip review and immediately set `User.chat_banned_until = now() + 365 days` (configurable). `legal_review=true` for `csam_suspect` triggers an out-of-band incident response.
  2. **Threshold review** — a 3rd report on the same `reported_user_id` within 30 days from **distinct reporters** auto-applies a 30-day chat ban (escalates: 30 / 90 / permanent).
  3. **Human review** — everything else lands in a moderator queue at `/admin/moderation`. Admin sets verdict in (`dismiss | warn | chat_ban_temp | chat_ban_perm | account_ban`).
- New columns: `User.chat_banned_until: datetime | None`, `User.role: enum(player | moderator | admin)` (only `moderator`+ can read the dashboard).
- Chat WS action (G34) checks `chat_banned_until` before relaying. Game actions remain unaffected — banned-from-chat users still see the table, play turns, and see other players' messages; their own messages are silently dropped (returned to them with `{type: "chat_blocked", reason: "muted"}`).
- Notification (G27) fires to the reported user when a verdict is applied, explaining the reason + appeal contact at `/contact`.
- Frontend: when the host checks « Signaler ce joueur » on the G32 ban modal, expand it to show the category dropdown + a 140-char reason textarea. Submit fires the same `ban` WS action with `report: true` + payload.
- Backend tests: report creates `ModerationReport` row; `hate_speech`/`csam_suspect` set `chat_banned_until` immediately; threshold (3 distinct reporters / 30 days) triggers temp ban; non-host can't report.
**Acceptance:** Host bans + reports a player for `hate_speech` → that player can still play games, but every chat message they send is dropped server-side with a polite refusal toast. The reported user receives a notification explaining the verdict and how to appeal.
**Dependencies:** G27 (notifications) for verdict pings; G34 (chat) for the chat-mute enforcement point; G35 (IP capture) for `ip_at_offense`.

### G34. AI chat content moderation — pre-send classifier + audit trail
**Why:** Once in-room chat ships (item 8), every message is a potential vector for hate speech, harassment, sexual content involving minors, doxxing, and spam. French law (LCEN art. 6, DSA implementation via DDADUE 2024), EU law (DSA art. 14/16/17/24 transparency and notice-and-action), and US norms (Section 230 safe harbor + COPPA + standard platform expectations) all expect the platform to actively moderate user-generated content **at the surface level**. We do that with a Claude-Haiku classifier inline before broadcasting any chat message; flagged messages are blocked at the source, never relayed, and the offender's strike count goes up — repeat strikes feed G33's report ledger.

**Scope:**

A. **Inline classifier (request path)**
- New service `app/services/chat_moderation.py` exposing `classify_message(text: str, locale: str) -> ModerationVerdict`.
- Calls Claude Haiku (`CHAT_MODERATION_MODEL=claude-haiku-4-5` env var, reuses existing `ANTHROPIC_API_KEY` from avatar moderation). System prompt asks for a JSON verdict: `{verdict: "safe"|"warn"|"block", category: <one of G33's enum>, confidence: 0..1, rationale: "..."}`.
- Locale-aware: prompt switches between French and English so it understands slang, slurs, and culturally specific expressions (a French-tuned pass catches verlan slurs that an English-only classifier misses).
- Latency budget: chat WS action awaits the classifier; if Haiku is slow (> 1.5 s timeout), fall back to a conservative regex deny-list (`app/services/chat_moderation_denylist.py`, curated + versioned) and log the timeout for ops follow-up.

B. **What gets blocked (rule set, anchored to law + norms)**
- **Always block** (any locale, any context):
  - CSAM-suspect content (grooming language, sexual content referencing minors)
  - Explicit sexual content targeting a named individual
  - Doxxing (real phone / address / full-name + location combination)
  - Credible threats of violence
  - Slurs targeting protected classes — race, religion, national origin, sexual orientation, gender identity, disability (French loi Pléven / loi Gayssot scope + EU framework decision 2008/913/JHA)
- **Warn + block** (single-strike):
  - Persistent harassment (name-calling, targeted insults)
  - Spam / flood (≥ 5 identical messages in 60 s)
  - Off-topic flooding
- **Warn-only** (allow):
  - Mild profanity in casual context ("merde", "fuck this dice roll")
  - In-game trash talk that doesn't target identity
- Policy boundary documented in a new `docs/MODERATION_POLICY.md`, linked from `/terms` and `/privacy`, so users see what is blocked and why — a DSA art. 14 transparency requirement.

C. **Block UX**
- WS broadcasts `{type: "chat_blocked", reason_key, category, strike_count}` **only to the sender** (not the room) — others see nothing, the bad message never relays.
- Sender sees an inline toast: « Ce message enfreint les règles ([category]). Avertissement X/3. »
- 3rd strike inside 24 h → auto temp-mute for the rest of the session (chat-only, game continues normally).
- Critical categories (`csam_suspect`, `hate_speech` with confidence ≥ 0.85) skip the strike system entirely and:
  1. Block the message
  2. Auto-create a `ModerationReport` with `reporter_user_id = SYSTEM_USER_UUID`, `legal_review=true` for csam_suspect
  3. Apply the G33 auto-escalate chat ban immediately

D. **Audit + transparency (DSA-aligned)**
- Every classification (block AND allow) persists to `ChatModerationLog(id, user_id, game_code, message_hash, locale, verdict, category, confidence, classifier_version, ip_at_send, created_at)`. By default we store the **hash only**, not the body. Body retained only when verdict ∈ {`warn`, `block`}, with 90-day retention after which the body field is null'd (DSA art. 17.2 — minimum retention to enable appeal).
- DSA art. 17: users can request their moderation history via the existing `GET /auth/export` endpoint (extend the export to include `chat_moderation_log` rows for the requesting user).
- DSA art. 24 transparency reports: nightly cron aggregates counts by category → exposed at `/admin/moderation/stats` (admin-only). Annual export of this data satisfies the platform-transparency reporting obligation.
- Appeal flow: every block-toast includes a « Contester » link that opens `/contact` pre-filled with the message hash + verdict. Admins can review at the dashboard and overturn (which deletes the strike + restores the message hash).

E. **Privacy + legal posture**
- Lawful basis (GDPR art. 6.1.f): legitimate interest in preventing abuse, balanced against the user's rights by: limited retention (above), explicit disclosure on Privacy page, redress path via /contact.
- French LCEN art. 6.I.7: as a hosting provider we have a duty to "prevent" certain content (apologie d'actes terroristes, pornographie enfantine, incitation à la haine raciale) — the always-block list above covers this.
- EU DSA: notice-and-action mechanism (G33's reporter flow), transparency reports (D above), out-of-court dispute settlement contact in `/terms`.
- US COPPA: minors disclosure already on register; chat is gated behind the existing age confirmation. Csam_suspect verdicts trigger an internal incident-response procedure (documented separately, not in code).
- The Claude moderation call sends only the message text + locale; no PII, no user_id, no game context. (Audit log on our side does link user_id; that stays internal and is covered by the export above.)

F. **Infrastructure**
- Rate-limit Anthropic calls per `(user_id, minute)` — 30 calls / minute / user — to mitigate abuse of the classifier as a paid resource.
- Failure modes: if Anthropic is down for > 60 s, fall back to deny-list-only and broadcast a system banner in chat ("Modération IA dégradée — règles strictes appliquées").
- Tests: 25+ unit tests across English and French covering each category (mocked Claude responses) + a small live-call smoke test gated by `RUN_LIVE_MODERATION_TESTS=1` for nightly CI.

**Acceptance:**
- Sending "you're trash, [slur]" in chat → message never broadcasts; sender sees the toast; strike +1.
- 3 strikes in 24 h → auto-mute for the session.
- Sending csam_suspect text → message blocked, `ModerationReport` created with `legal_review=true`, user globally chat-banned via G33 auto-escalate.
- Clean messages relay with < 200 ms p50 added latency on the happy path.
- Moderation history exportable via `/auth/export`.

**Dependencies:**
- Item 8 (chat itself) ships **alongside** this — the gate exists from day one of chat, not as a follow-up.
- G33 (report + chat-ban) for the escalation target.
- G35 (IP tracking) for the `ip_at_send` audit column.
- New `docs/MODERATION_POLICY.md` to back the UI rationale.

### G36. Chat anti-spam / rate-limiter
**Why:** Without active rate-limiting, a single user can flood the chat with thousands of messages — burning the moderator AI's API budget, blowing past Claude Haiku rate limits, and drowning the room. This complements G34's content classifier: G34 says "this message isn't allowed", G36 says "you can't send 50 messages in 5 seconds, no matter how clean each one is."

**Scope:**

A. **Server-side token bucket** (new `app/services/chat_ratelimit.py`)
- Per `(user_id, game_id)` bucket: capacity 5 messages, refill 1 token / 2 s. Burst-friendly but caps sustained rate at 30 msg/min.
- Per `user_id` global bucket (across all rooms): capacity 8 messages, refill 1 token / 1 s. Stops a single user spamming N rooms at once.
- Buckets live in-process (no Redis dependency for v1); a memory check before each `chat_send` action. Lost on restart, which is fine — spammers are mostly real-time.
- Hard length cap: 280 chars per message (enforced before calling G34's classifier — saves API calls on copy-paste novella spam).
- Identical-message dedupe: same `(user_id, sha256(body))` within 60 s → silently drop with `{type: "chat_blocked", reason: "duplicate"}`.

B. **Escalating cooldown**
- 1st bucket trip in 5 min → 10 s cooldown, soft toast.
- 2nd trip → 60 s cooldown, harsher toast.
- 3rd trip → 5 min session mute + 1 strike against G34's strike system.
- 4th trip → temp chat ban per G33 threshold review.

C. **Frontend UX**
- Chat input shows a small cooldown indicator (a thin shrinking bar above the input) when the user is rate-limited; submit button disabled.
- Toast wording stays polite and rule-clear: « Doucement ! Vous pouvez envoyer un message toutes les X secondes. »
- A user near their bucket limit (≤ 2 tokens left) sees a subtle color shift on the input border — no toast, just a warning.

D. **Tests**
- Bucket fills, drains, refills correctly under simulated time.
- 6 rapid messages → 5 broadcast, 6th rejected with `rate_limited`.
- Identical messages dedupe within window, separate after.
- Cross-room cap: spamming room A counts against the user's global bucket → room B is also throttled.
- Escalation: 3 trips in 5 min → session mute fires.

**Acceptance:** Loading the chat with a `for (i=0; i<100; i++) ws.send(...)` script results in 5 messages broadcast then a clear cooldown UX; the room stays usable for everyone else.

**Dependencies:** Item 8 (chat) — same ship train as G34. Strike-count interaction documented under G34.

### G37. Peer-reporting + AI triage automation (admin-effort-minimal)
**Why:** Two problems to solve together. (1) The host isn't always the offended party — any player in the room should be able to flag a single message for review. (2) Manually reviewing every report does not scale and is the explicit thing you want to avoid. So: any user reports → Claude Haiku triages the report against the message + nearby context → applies the verdict autonomously in 90%+ of cases → only ambiguous and high-severity (legal-review) cases land in a human queue. The reporter and reported user both get clear status updates without admin involvement. Your inbox should only see the cases AI can't resolve.

**Scope:**

A. **Peer-report UI**
- Hover (desktop) / long-press (mobile) on any chat message reveals a ⚠ icon.
- Click opens a modal with the same category dropdown as G33 (`harassment | hate_speech | sexual | csam_suspect | spam | doxxing | other`) + 140-char reason textarea.
- One report per `(reporter, message)` (frontend disables the icon for already-reported messages; backend enforces uniqueness).
- After submit: « Merci. Votre signalement a été reçu et sera examiné. » No verdict shown to reporter (privacy).
- The reported user gets a notification (via G27) **only once a verdict is applied**, not at report time — prevents tip-off.

B. **MessageReport table + AI triage job**
- New `MessageReport(id, reporter_user_id, reported_user_id, message_id, room_code, category, reason_text, ip_at_report, created_at, ai_verdict, ai_confidence, ai_rationale, ai_triaged_at, human_verdict, human_verdict_at, human_verdict_by, status)`.
- `status` ∈ {`pending_ai`, `auto_resolved`, `pending_human`, `human_resolved`, `appealed`, `appeal_resolved`}.
- On report submit: row inserted with `status="pending_ai"`, background task `triage_report(report_id)` scheduled.
- Triage prompt to Claude Haiku: reads the reported message + 5 messages before/after for context + reporter's category + reason + reported user's prior verdict count.
- Haiku returns JSON: `{verdict, confidence, rationale, recommended_action}` where verdict ∈ {`dismiss`, `warn`, `temp_mute_30m`, `temp_mute_24h`, `escalate_chat_ban`, `human_review`}.

C. **Auto-actions (no admin in the loop)**
- `dismiss` (confidence ≥ 0.7) — `status = auto_resolved`, log, done. Reporter sees nothing more; reported sees nothing. If 3 consecutive dismisses on the same reporter in 30 d, their reports get `low_reliability=true` and de-prioritize in any human queue (reduces brigade-reporting).
- `warn` — auto-warn the reported user via G27 ("Un message a été signalé comme [category]. Merci de respecter les règles."). No mute. `status = auto_resolved`.
- `temp_mute_30m` / `temp_mute_24h` — set `User.chat_banned_until = now + N`. Notify reported user with reason. `status = auto_resolved`.
- `escalate_chat_ban` — apply G33 auto-escalate (chat-ban perm or 365d). Notify. `status = auto_resolved` + `legal_review=true` for `csam_suspect`.
- `human_review` — `status = pending_human`. Lands in the moderator dashboard `/admin/moderation`. **This is the only path that touches you.**

D. **Two confidence rails**
- Triage only auto-applies a verdict when `ai_confidence ≥ 0.75` for non-critical actions (warn / temp_mute_30m) and `≥ 0.85` for severe actions (temp_mute_24h / escalate_chat_ban). Below threshold → falls through to `human_review`.
- Critical categories (`csam_suspect`, `doxxing` with named victim) **always** go to `human_review` even with high confidence, because the legal consequences of an AI false-positive are large.

E. **Self-tuning feedback loop (optional v2)**
- When an admin overturns an auto-resolved verdict on appeal, the system records a `triage_correction` row.
- Nightly job: if the corrections show systematic over- or under-blocking by category, bump the per-category confidence threshold up or down by 0.05 (bounded between 0.6 and 0.95). Logs the change so you can audit.
- This is optional for v1 — ships as a manual `ANTHROPIC_CONFIDENCE_THRESHOLD_<CATEGORY>` env override if the auto-tune feels too magical.

F. **Reporter accountability (anti-abuse)**
- 5 dismissed reports in 30 d → reporter's badge `low_reliability=true` (used to de-rank their reports in the human queue, but they can still report).
- 3 confirmed-false reports (admin-overturned dismisses) → soft-warn the reporter via G27.
- 5 confirmed-false reports → 24 h report-cooldown on that reporter.
- Goal: the social cost of false reports stays non-zero without chilling legitimate ones.

G. **Daily admin digest (optional but recommended)**
- Nightly Resend email to all `User.role IN (moderator, admin)`: "Last 24h: X reports received, Y auto-resolved (% breakdown by verdict), Z pending human review, W appeals awaiting." Link to dashboard.
- Lets you stay on top of the queue without polling the dashboard.

H. **Tests**
- Reporter submits → row created with `pending_ai` → background task runs → row updates to `auto_resolved` with verdict.
- Critical category (`csam_suspect`) → always `pending_human` regardless of confidence.
- Low confidence on warn-tier verdict → falls through to `pending_human`.
- 5 dismisses on same reporter → `low_reliability` flag set.
- Notification fires only after verdict, never on submit.

**Acceptance & target metrics:**
- ≥ 90% of reports auto-resolved without admin action.
- Median time-to-verdict ≤ 30 s (AI triage latency).
- Zero false negatives on the `csam_suspect` / `doxxing` paths (those always escalate to human).
- Admin opens dashboard once a day, sees ≤ 5 items needing attention in a typical week of 1000 reports.

**Dependencies:**
- Item 8 (chat) for `message_id` foreign key.
- G33 (chat-ban infrastructure) for verdict application.
- G27 (notifications) for reporter and reported user notifications.
- G34 (Claude Haiku integration) — reuses the same client setup.
- Optional G35 for `ip_at_report`.

### G35. IP-based ban enforcement (room + global)
**Why:** A banned user can open a private browsing window, create a second account, and rejoin the same room within seconds. IP-based enforcement closes that loop without turning the platform into a privacy nightmare.

**Scope:**

A. **What we capture**
- WS handshake: capture `request.client.host` (FastAPI exposes via ASGI scope), respecting `X-Forwarded-For` **only** when the source matches an `TRUSTED_PROXY_IPS` env-gated allowlist of our known proxies/load balancers. Never trust client-sent IPs otherwise.
- Auth register + login: same capture; stored as `User.last_ip` (rolling, single field — we don't need a full history).
- Ban-time IP: when G32 ban or G33 chat-ban applies, snapshot the IP at offense into `RoomBan.banned_ip` / `ModerationReport.ip_at_offense`.

B. **Enforcement at three boundaries**
- **WS join handler**: look up `(game_code, current_ip)` against `RoomBan`. If matched → reject with `{type: "join_rejected", reason: "banned_ip"}`.
- **WS chat send** (G34 integration): look up `current_ip` against active `ModerationReport.ip_at_offense` where verdict ∈ {`chat_ban_perm`, `chat_ban_temp` and not expired}. If matched → drop with `{type: "chat_blocked", reason: "banned_ip"}`.
- **Account creation** (`POST /auth/register`): look up `current_ip` against active global chat-bans; if matched, the new account is created with `chat_banned_until` set to mirror the source ban (anti-evasion). The new user can play, just can't chat.

C. **Privacy posture (GDPR-conscious)**
- IP is personal data under GDPR. Lawful basis: legitimate interest in abuse prevention, narrowly tailored.
- Retention: `RoomBan.banned_ip` kept until ban expires + 30 days; `User.last_ip` overwritten on every login (no history); `ModerationReport.ip_at_offense` kept 365 days then null'd by a daily cleanup job (verdict stays, IP doesn't).
- Privacy page (item 3) updated to disclose IP capture, retention windows, and the GDPR art. 17 right to deletion (modulo legal-hold exceptions).
- **CGN / VPN false-positive guard**: when a join is rejected by IP **alone** (no user_id match) and the joining user has a verified account in good standing (no prior reports), surface a « Pensez-vous que c'est une erreur ? » link that opens `/contact` pre-filled with the room code. Manual unblock at the moderator dashboard.
- We match **exact IP only**, never CIDR ranges — this is enough to deter casual evasion (private window, fresh signup) without over-blocking shared exits.

D. **Tests**
- Ban → rejoin same browser (same IP) → rejected by IP match.
- Ban → rejoin different IP same account → rejected by user_id match.
- Ban → rejoin different IP + private browsing (new account) → allowed, but with `chat_banned_until` propagated if the IP matches a global chat-ban.
- Trusted proxy: `X-Forwarded-For` honored when peer IP is in `TRUSTED_PROXY_IPS`, ignored otherwise.
- IP retention: a `ModerationReport` row older than 365 days has its `ip_at_offense` field nulled by the cleanup job.

**Acceptance:** A banned player can't trivially evade by opening a private window. Legitimate users sharing an exit IP (CGN, university, café Wi-Fi) can appeal and get unblocked manually.

**Dependencies:**
- G32 + G33 produce the records this checks against.
- Privacy page (item 3) needs the disclosure copy update.
- `TRUSTED_PROXY_IPS` env var set in production before this matters — without it, every request looks like it comes from the load balancer's internal IP.

### 8. In-room chat with AI moderation
**Why:** Public rooms benefit from chat for vibe; need toxic-content filtering and a graduated enforcement model.
**Scope:**
- WS subprotocol for chat: new actions `chat_send`, `chat_history`. Rate-limit per player.
- Moderation pass: Claude Haiku content classification (same pattern as avatar moderation in `app/routers/auth.py::_moderate_image`). Classify each message as safe/warn/block — **see G34 for the full classifier + audit-trail plan**.
- Persistence: `ChatMessage` table (game_id, user_id, body, sent_at, moderation_verdict). Per-game retention (purge on game end).
- Frontend: chat panel in `Game.jsx` toggle; basic message UI; redaction display for blocked messages.
**Acceptance:** Players can chat; obviously toxic messages are blocked with a placeholder; moderator dashboard shows incidents.
**Dependencies:** G34 (AI moderation), G36 (rate-limiter), G37 (peer-reporting) ALL ship alongside this — chat without those is a liability. Item 9 (enforcement system) handles repeat-offender behavior; G33 is the room-host-driven realization of that.

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

- **2026-05-23** `63733a4` — G20: action-bar eyebrow + serif text bumped to readable sizes (0.78rem / 1.05rem; ink-soft instead of ink-mute). Top-panel control buttons (host's ⚙ Room rules and everyone's 🚪 Quitter) are now proper rounded pill buttons with hover states — Quitter is rouge-bordered and fills rouge on hover for visibility; Room rules is neutral. Both stay compact and wrap cleanly on narrow widths.
- **2026-05-23** _(pending SHA)_ — Test coverage backfill (CI gate was failing at 77%). Added 8 WS integration tests covering the new actions in `_dispatch`: `initial_roll`, `roll`, `keep`, `done`, plus `kick` (non-host rejected, host removes target, can't target self, missing target_id is no-op) and a CHARGE-phase seed helper. Coverage back to 83.99% (≥ 80% gate). Added roadmap G30: external invite delivery (copy link + email/SMS/WhatsApp).
- **2026-05-23** `38421d9` — Fixed `PATCH /auth/me` returning 422: the `req()` wrapper in `api/auth.js` was spreading `opts` AFTER its own headers, so the `Authorization: Bearer ...` from callers stripped the `Content-Type: application/json`. FastAPI then couldn't parse the JSON body. One-line fix: spread `opts` first, build headers second. Also: after a successful lang_pref save, the profile now calls `setLang()` so the UI flips language immediately (G26 partial — full login-time sync still queued). G26 (lang follows profile), G27 (notifications), G28 (friends/follow), G29 (invite-friends) added to roadmap. G18 still covers the empty-stats issue (round_points / games_played never persist because game-end no longer auto-fires).
- **2026-05-23** `c664399` — G24: host kick. New WS action `kick {target_id, reason}` (host-only, can't kick self). Sends `{type:"kicked", reason}` to target's socket before closing it, then runs the same cleanup as leave (drops them from players/match_losses/round_points/etc., reassigns round_starter / current_index, resolves cycle if all_done). New `log_player_kicked` journal event. Frontend: small ✕ kick pill on each non-self player strip (host-only); confirms via ConfirmModal; KickedOverlay on the kicked client explains the reason (default "absence prolongée du clavier"; structured for future chat-moderation reasons — toxic/spam/default keys already in i18n).
- **2026-05-23** `3f56da9` — G23: SelfPlayToast. Bottom-right brass-bordered notification pops when the local player's turn ends (manual done OR auto-validate OR AFK bot taking over for them). Reads: "Vous avez joué [4-2-1] → 421 (8f). À NextPlayer de jouer." Different copy when the bot took the turn ("Coup joué par le bot"). Auto-dismiss 5s, click to dismiss. Triggers off log_turn/log_afk_turn events where `name === me.name`, dedup via ref-counter.
- **2026-05-23** `fee800a` — Round-loss banner differentiation (count=2 shows "X a perdu la partie !" with stronger styling instead of repeating "X est manché"). Manche + round-point pips (💀 / 🏷) on PlayerStrip and PisteSeat so every seat shows their losses at a glance. New `log_afk_takeover` event surfaced before the bot turn so the table knows who stepped away. Roadmap items G23 (self-play toast), G24 (host kick), G25 (manche markers — done in this batch) added.
- **2026-05-23** `63733a4` — G20: action-bar polish + Quitter/Room rules pills.
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
3. **Cut a new branch from `develop`** using a Conventional-Commits-style slug:
   - `feature/<slug>` for new features
   - `fix/<slug>` for bug fixes
   - `chore/<slug>` for docs / roadmap / CI tweaks
   - `refactor/<slug>` / `test/<slug>` for those respectively
4. Ship commits on that branch. Run the full gates before pushing:
   - `pytest tests/ --cov=app --cov-fail-under=80`
   - `ruff check app/ tests/` + `ruff format --check app/ tests/`
   - `npm --prefix frontend run lint` + `npm --prefix frontend run build`
5. `git push -u origin <branch>` (NOT to develop directly).
6. Open a PR into `develop` with this body shape:
   ```
   ## Summary
   - <1–3 bullets>

   ## Changes
   - <file/area> — <what>

   ## Test plan
   - [ ] <how to verify, locally and in CI>

   ## Roadmap
   - Closes G<n>  (or: addresses part of G<n>; full scope in G<m>)
   ```
7. After merge, update this file: status → **Done**, add the commit SHA.

When adding a new idea: drop it in **Maybe** with a one-line *Why*. Promote it once we've thought through scope.

**Branch protection rule of thumb:** `develop` is the integration branch; nothing lands there without a PR. `main` is stable; only merges from `develop`. Hotfixes can branch from `main` (`hotfix/<slug>`) and back-merge to both.
