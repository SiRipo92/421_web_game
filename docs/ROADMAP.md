
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

### G1. (DONE — pending PR merge) AFK-timer reset on every player interaction (not just per-turn)
**Why:** Reported by playtest. Today the AfkBar countdown only resets when the current player changes — but selecting dice (`keep` action) on the backend DOES reset the AFK timer, so the displayed countdown is misleading. The user sees the timer ticking down even though they're actively interacting.
**Scope:**
- Server: emit `afk_started_at` (epoch ms) in `game_state`. Update it whenever `_schedule_afk` (re-)starts the current player's timer (roll/keep/done/tiebreak_roll).
- Client: `AfkBar` reads `state.afk_started_at` + `state.room.afk_seconds` and computes remaining time. Re-mounts naturally when the value changes.
**Acceptance:** A player can hover/click dice for 60+ seconds without the AFK bot taking over.

### G2. (DONE — pending PR merge) Bot-handback flow when a player returns
**Why:** Today, once the AFK bot takes a turn, the cycle advances and the player who came back can't "reclaim" their seat for the current cycle. Per the spec the bot should hold the player's slot for a couple seconds to allow a comeback before fully resolving.
**Scope:** Defer the bot's `advance() → _resolve_round` chain by 2–3 seconds. If the human reconnects via any WS action in that window, abort the bot's pending advance and restore the player's normal turn.
**Acceptance:** Player AFKs through one bot turn, returns mid-cycle, and is back in control immediately for the next throw.

### G3. (DONE) Auto-validate `done` when the player is at max throws with no choice left
**Why:** If a non-starter has used the starter's max throws and can't roll anymore, the "Done" button is the only action and should fire automatically.
**Status:** Already implemented inline in `ws.py` `roll` handler at lines 540–566 (tagged `# Auto-validate (G3)`). Verified during the polish-bundle work; no code change needed.
**Scope:** In the `roll`/`keep` handlers, after applying state, check whether `rolls_used >= max_throws_this_round` AND there are no kept-out dice. If so, treat as if the player called `done`.
**Acceptance:** Starter rolls once + clicks done → other players auto-validate after their single throw, no extra click needed.

### G4. (DONE — pending PR merge) Hide the throw counter when there's only one throw to make
**Why:** Showing "0/3 throws" before the starter has set the rhythm is fine; showing "0/1" or hiding altogether once the starter capped the rhythm at 1 makes the UI cleaner.
**Scope:** In `Game.jsx`'s `RollDots`: render only when `max_throws_this_round > 1` OR for the starter when the rhythm isn't yet set.

### G5. (DONE — pending PR merge) Clarify "keep vs reroll" affordance on dice selection
**Why:** Reported. Today clicking a die toggles `reroll[i]` but the visual encoding isn't clear about what each state means.
**Scope:** Add an on-die badge/icon (✓ for "keep", ↺ for "reroll"). Add a one-line legend above the dice row ("Cliquez pour relancer / Click to re-roll").

### G6. (DONE — pending PR merge) Personalize log entries with "Vous" / "You" for the current viewer
**Why:** Reported. "TheWitch donne 1 jeton(s) à Sisi" reads as third-person even when you are TheWitch.
**Scope:** Frontend `formatLogEntries`: when `params.name` (or `winner`/`loser`/`starter`) matches the local `playerId`'s name, substitute the `you_*` i18n string. Could also display contextual flash messages: "You just received 2 chips. Your turn."

### G7. Tied winners in décharge → winner-tiebreak (R1 follow-up)
**Why:** R1 covered tied losers. Exact-same-combo tied winners in décharge still take the "no transfer this cycle" path. Per the spec, they should re-roll to pick the giver.
**Scope:** Mirror the loser-tiebreak code path with `purpose="winner"`. `_resolve_tiebreak` picks HIGHEST rank (giver) instead of lowest. Winner gives `original_penalty` chips to the original loser.

### G9. (DONE — pending PR merge) Smarter AFK bot
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

### G14. (partially DONE — pending PR merge) Layout overhaul — piste sizing, dice placement, log positioning
**Why:** The piste doesn't take up the screen's full visual real estate; the dice area and chip stack sit inside a small circle while the rest of the page has unused white space. The user wants the game to feel "bigger".
**Scope:**
- Rework `Game.jsx`'s main grid:
  - Make the piste 70–80% of the viewport (clamp aspect-ratio: 1).
  - Move the dice + combo display to a fixed bottom-of-piste position, larger, more readable.
  - Right-side log → narrower, full-height column.
  - Left-side commentary ticker (G10) gets a permanent slot.
- Consider a CSS grid: `[ticker 280] | [piste 1fr] | [log 320]` on wide screens, stacked on mobile.
**Acceptance:** On a 1440-wide screen, the piste fills > 60% of the available width, dice are clearly readable without leaning in, log is still visible.

### G15. (DONE — pending PR merge) Visible turn-rhythm + throws indicator
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

### G21. (partially DONE — pending PR merge) Live play commentary + score-to-beat banner
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

### G18. Round-point persistence trigger (partially done — leave/kick path landed)
**Why:** With no auto-game-end, `_persist_game` only fires for the lone-survivor edge case. Logged-in users' round points accumulated in a session are lost when the room dissolves.
**Scope:** Trigger persistence (1) when a player leaves the room mid-game, (2) when the room dissolves (last player leaves or host migrates). Write `round_points[pid]` to `GamePlayer.round_points` and update `PlayerStats`.
**Status:** Leave / kick path done in `feature/g18-round-point-persistence` (new `persist_player_session` writes to `PlayerStats`: `games_played +1`, `losses += round_points` or `wins +1` if 0). **Still queued for follow-up:** `GameRecord` + `GamePlayer` history-row writes on room-dissolve (the "Recent Games" panel stays empty until those land), and a proper ELO recalc trigger.

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

### G44. Fix: spurious "sits out" log at match-end
**Why:** Reported during playtest. In a 2-player game, after décharge resolved with TheWitch holding 11 (manché) and Julien at 0, the log read « Julien is out of chips — sitting out until the next match. » immediately followed by the next match starting. Julien isn't sitting out — he won the manche; the next match starts with fresh chips for everyone. The "sits out" message is irrelevant (and misleading) when the same cycle that emptied a player also triggered the match-end.
**Scope:**
- `_finalize_cycle` in `app/game/logic.py` currently adds the zero-token player to `out_of_match` *before* the `manche` check that resets chips. Two clean fixes to weigh:
  - (a) reorder: detect a manché winner first; if the cycle ends the match, skip the `log_player_sits_out` emit (and don't add to `out_of_match`) for any player who'd be reset on the new match anyway.
  - (b) keep the order but, when the manché check fires, splice out any `log_player_sits_out` events that landed in the same cycle and clear the `out_of_match` entries that the new match would reset.
- Prefer (a) — fewer state mutations to walk back. Verify nothing downstream depends on `out_of_match` being populated transiently within `_finalize_cycle`.
- Add a regression test in `tests/unit/` that simulates a 2-player end-of-décharge where one player hits 0 and the other hits 11, and asserts no `log_player_sits_out` event lands in the resulting log.
**Acceptance:** Two-player game; player A reaches 11 (manché) while player B reaches 0 in the same cycle. The journal shows the manché entry and a fresh-match start, but no "sits out" line for player B.
**Dependencies:** None. Pure bug fix.

### G45. (DONE — pending PR merge) Host: edit room rules mid-game (apply after current partie)
**Why:** The room owner today only has a « View room rules » affordance during play — the rules panel is read-only. Reported as a gap: the host should be able to *adjust* the room rules (e.g. bank rule, max throws, AFK timeout, spectators on/off) while a partie is in progress, with the change taking effect after the current partie finishes so live play isn't disrupted mid-cycle. Reported again as critical for tables with 5+ players: at that size everyone rolling 3 throws per cycle slows the bank distribution dramatically — the host should be able to switch to `sec` mid-partie to speed things up for the next partie.
**Scope:**
- Backend: new WS action `update_room_rules {bank_rule?, max_throws?, afk_seconds?, afk_bot?, spectators?}` — host-only. Validates the partial payload against the room-config schema, stores the diff in a `Game.pending_room_rules` dict, broadcasts the pending changes so the UI can preview them.
- Apply on partie-end: in `_finalize_cycle` (or wherever a new partie is bootstrapped after a manché → round-point reset), if `pending_room_rules` is non-empty, merge it into the live `Game.room` and clear the pending dict. Emit a `log_room_rules_updated` event so players see what changed.
- **Journal (Ardoise) announcement, per-field:** the `log_room_rules_updated` event payload includes the diff (e.g. `{bank_rule: "free" → "sec"}`) and the journal renders a human-readable line per change: « L'hôte a changé la distribution : Libre → Sec » / « Inactivité : 45s → 20s ». This is critical so other players see *what* was changed and *when* the change took effect.
- Frontend: in `RoomSettingsPanel`, when the viewer is the host AND the game is in-progress, switch the read-only fields to editable; a « Sauvegarder pour la prochaine partie » CTA fires the new WS action. Visual badge on the panel — « En attente : prendra effet à la prochaine partie » — when `pending_room_rules` is set.
- i18n keys: `room_rules_edit_cta`, `room_rules_pending_banner`, `log_room_rules_updated_*` (one per changed field for the journal entries).
- Tests: host can update; non-host rejected; changes don't take effect until partie-end; multiple consecutive edits stack into the same pending diff (last write wins per field); journal logs each changed field separately.
**Acceptance:** Host opens room settings mid-partie, flips libre → sec, saves. A banner shows « Prendra effet à la prochaine partie ». When the current partie resolves and a new partie starts, the rhythm cap moves to 1 and the Ardoise shows a journal line confirming the change. Other players see the same Ardoise entry.
**Dependencies:** None. Builds on the existing `RoomSettingsPanel`. Pairs naturally with [[G15]].

### G46. (DONE — pending PR merge) In-game presentation settings (FR/EN + light/dark + room defaults)
**Why:** Reported during playtest. The TopBar carries the FR/EN switcher and theme toggle on every other page, but the game room hides the TopBar (intentional — the action bar takes precedence), and there's no in-room equivalent. A player who landed on the wrong language or finds the contrast unreadable can't switch mid-game without leaving the room. Compounded by the user's separate observation: as host they want to set *room defaults* for these presentation choices (so the table opens consistently), with each player able to override locally if they want.
**Scope:**
- **Per-player overrides (always available):** a compact « ⚙ Affichage » popover accessible from the game-room action bar (or the room settings panel header) exposes:
    * Language: FR ↔ EN toggle. Reuses `useLang().setLang` + the existing localStorage persistence.
    * Theme: light ↔ dark toggle. Reuses `useTheme().setTheme` + localStorage. (Existing dark theme already defined in `styles.css:42-61`.)
    * Sound toggle (placeholder for [[G31]] — keep the popover slot here so future audio prefs slot in cleanly).
  Available to every player at every viewport, including mobile (drawer-accessible there).
- **Room defaults (host only, set during room creation):** extend `CreateRoom.jsx` with two new fields:
    * Default language for the room (FR / EN)
    * Default theme for the room (light / dark)
  Persist on `Game.room_defaults` (or as part of the existing `Game.room` config). New players entering the room adopt these defaults UNLESS they have a per-player override saved in localStorage from a previous session, in which case the override wins.
- **Logged-in sync (FR/EN only):** mirror the existing `updateMe({lang_pref})` background write the TopBar toggle does — so a user's account `lang_pref` syncs across rooms. See [[G26]]. Theme pref similarly hooked to `User.theme_pref` (new column or extend an existing JSON field).
**Acceptance:** A player in any game room can flip FR ↔ EN and light ↔ dark via the in-room settings popover; choices persist across reloads. Host creating a room can set defaults that new joiners adopt unless they have a personal override saved. Logged-in users see their account's `lang_pref` and `theme_pref` stay in sync across rooms.
**Dependencies:** None for the per-player overrides (light-touch UI change). The host-default + account-sync paths need a small backend schema bump (`Game.room.default_lang`, `Game.room.default_theme`, plus `User.theme_pref` migration).

### G47. (DONE — pending PR merge) Local player anchored at the bottom of the piste — and visually emphasized
**Why:** Reported during playtest. The piste shows all players' seats arranged around the table, but the *viewer's* seat isn't anchored — it can land anywhere on the ring depending on turn order. The user wants the local player to always sit at the bottom (closest to the action bar) so they can identify themselves at a glance, like every poker / card-game UI does. Compounding it: today every seat renders at the same size, so even once anchored, the viewer's seat can be hard to spot at first glance — the user wants their own avatar *larger* than the competitors'.
**Scope:**
- Frontend: in `Game.jsx`'s `PisteSeat` rendering loop, compute the player order so the local `playerId` is always at index 0 of the visual ring; other players fill the remaining seats in their original turn-order. The bottom slot in the piste maps to index 0.
- Verify with 2, 3, 4, and 5 players that the ring stays geometrically sensible (the viewer always at the south position, others distributed clockwise from there preserving turn order).
- **Viewer-emphasis sizing:** the bottom seat (the local player) renders at ~1.25× the avatar size + font size of the other seats. Variant: a `isSelf` prop on `PisteSeat` that scales `transform: scale(1.25)` with the transform-origin at the bottom edge so it grows up/in rather than spilling past the ring boundary.
- Add a subtle "you" indicator (e.g. a thin brass underline or an « ↓ Vous » caret) on the bottom seat to reinforce identification, especially in 2-player rooms where the visual asymmetry alone might not read.
- Don't break the existing turn-indicator (active-player glow) — that still follows the current player wherever they sit on the rotated ring. The viewer's larger-seat treatment is *orthogonal* to the active-player highlight: it persists even when it's not the viewer's turn, so they can always locate themselves.
**Acceptance:** Joining a room from any account always renders that account's seat at the bottom of the piste, noticeably larger than the other seats; the other player(s) sit above at their normal size. Switching accounts in two browser windows shows each viewer their own seat at the bottom and larger.
**Dependencies:** Pairs nicely with [[G14]] (piste sizing overhaul) — both touch the piste geometry. Worth bundling if [[G14]] is still in flight. Coordinates with [[G53]] (current-player animation) — both target seat affordances.

### G48. Public-rooms list pagination
**Why:** The public/open-rooms list today renders every visible room in one shot. With even modest growth (50–100 concurrent open rooms) this becomes a perf cliff (DOM size + initial fetch + render thrash on each WS room-list update) AND a UX cliff (scrolling through dozens of identical cards isn't logical browsing). Pagination + a smarter card layout keep both bounded.
**Scope:**
- Backend: `GET /api/games/public` paginates — `?page=1&page_size=12` (default 12 per page; cap `page_size` at 24). Response: `{items: [...], page, page_size, total, has_more}`. Add `ORDER BY created_at DESC` for deterministic ordering. Index on `(is_private, phase, created_at)` to keep the count + slice fast.
- WS broadcast: instead of pushing the full list on every change, push a `public_rooms_changed {page_hint?}` event; the client re-fetches the current page when it lands. Avoids broadcasting growing payloads. Optional v1: keep the existing full-list broadcast but bump it to a small enough fixed window (top 24 by recency) so the wire never gets huge.
- Frontend: `Lobby.jsx` (or wherever `/rooms` lives) renders a paginated list with « ‹ Précédent · 1 / 5 · Suivant › » controls. Cards stay compact — host avatar, room name, phase pill, player count `N/Max`, bank rule badge, AFK config indicator, « Rejoindre » CTA. 3-column grid on desktop, single column on mobile.
- Filter / sort affordances (defer to v2 if scope creeps): filter by bank rule (sec/libre), by phase (waiting/in-play), by player count. Sort options: newest / fewest-players-needed-to-fill / room name.
- Empty state: « Aucune table publique pour le moment — créez la vôtre ! » with a primary CTA to the create-room flow.
- Tests: backend pagination — first/middle/last page, page beyond `total`, page_size clamping. Frontend — page changes trigger re-fetch, WS change refreshes current page, pagination disabled when `total ≤ page_size`.
**Acceptance:** 100 open rooms exist; the lobby page loads in < 200 ms, shows page 1 of ~9 with 12 cards, pagination controls work, WS room-state changes refresh only the visible window.
**Dependencies:** None. Pair-friendly with [[G11]] (single-player waiting modal) — both touch room-state UX.

### G49. Password field show/hide toggle (login + registration)
**Why:** Standard accessibility / usability affordance: an eye icon inside the password input lets the user reveal what they typed before submitting. Reduces failed-login frustration (typos in masked input), helps users on touch keyboards verify their entry. Today both `/login` and `/register` mask the input with no reveal option.
**Scope:**
- Promote the existing password `<input>`s into a small reusable component `PasswordField.jsx` (in `frontend/src/components/shared/`) that wraps an `<input>` + an absolutely-positioned eye/eye-off icon button at the right edge. Toggling the button flips `type` between `"password"` and `"text"`.
- Accessibility: `aria-pressed` on the toggle, `aria-label="Afficher le mot de passe"` / `"Masquer le mot de passe"` (i18n keys `password_show` / `password_hide`), focus stays on the input when toggling. Keyboard-only users reach the toggle via Tab.
- Icon: SVG inline (no new dep). Lucide-style eye + eye-off paths inlined for consistency with the rest of the codebase (the project already uses inline SVGs).
- Wire into `LoginForm` + `RegisterForm` (the password + confirm-password fields). Same component, no duplication.
- Don't auto-reveal — default to masked; user opt-in only.
- Consider a small affordance for "your password is currently visible" (e.g. soft red ring around the field) so users don't accidentally screenshot or share-screen a visible password.
- Tests: toggling flips the input type; aria-label updates; focus stays on the input; default state is masked on every form mount (don't persist).
**Acceptance:** On both login + register pages, every password field has an eye icon at the right edge. Clicking reveals the current value; clicking again re-masks. Keyboard + screen-reader accessible.
**Dependencies:** None.

### G50. « En Direct » ticker — dedup repeats, allow scroll, raise card cap
**Why:** Reported during playtest. The commentary ticker filled up with six near-identical lines (`TheWitch is AFK — the bot takes over.` · `Julien is AFK — the bot takes over.` · repeat × 6). Two compounding problems: (1) `CommentaryTicker` doesn't coalesce consecutive events with the same `(key, name)` — every AFK timeout creates a brand-new card; (2) both the outer container and the inner card column use `overflow: hidden` with no scroll fallback, so when content does exceed the slot it just clips. Combined effect: the panel becomes a wall of duplicates that scroll *off the screen* with no way for the player to read what they missed.
**Scope:**
- **Dedup pass.** Inside `CommentaryTicker.useMemo`, walk events newest-first and collapse runs where the current and previous accepted card share the same `(key, name)` (or `(key, names)` for plural events). Annotate the surviving card with a `repeat: N` count when N > 1. The card UI renders « X is AFK — the bot takes over. (×3) » when `repeat > 1`. Non-adjacent recurrences stay as separate cards — only consecutive runs collapse.
- **Scroll-on-overflow.** Bump `MAX_CARDS` from 5 to ~10, switch the inner card column from `overflow: hidden` to `overflow-y: auto`, give it a sensible `flex: 1` so it claims the remaining vertical space inside the ticker's parent column. The outer container keeps `overflow: hidden` for the slide-in animation framing; the inner list scrolls.
- **Subtle scroll affordance.** Tiny brass scrollbar styling (matches the existing right-side log) so the user can tell content extends below.
- **Auto-scroll behavior.** When a new card lands, scroll the inner list back to the top (newest at top) — don't strand the player in the middle of old cards.
- **Edge case.** The repeat-counter should reset when the active player rotates: « TheWitch AFK · Julien AFK · TheWitch AFK » should stay three cards, not collapse to two with `repeat: 2` on the first. The collapse key already includes `name`, so this falls out for free, but explicitly test it.
- Tests (frontend, if a vitest harness exists; otherwise document a manual checklist):
  - 5 identical AFK events → 1 card with `(×5)`.
  - 3 mixed AFK events (alternating names) → 3 separate cards.
  - 12 distinct events → 10 cards visible; oldest 2 scroll into view.
**Acceptance:** Playing a match where both players AFK multiple times produces a ticker showing at most one card per consecutive run (with a count), the inner list scrolls when content overflows, and the most recent event always sits at the top.
**Dependencies:** None. Touches only `CommentaryTicker.jsx` + its styles.

### G51. SelfPlayToast — bigger, centered, more presence
**Why:** Reported during playtest. The post-turn toast (G23) lands as a 360px-wide card pinned to the bottom-right corner. Easy to miss on a 1440-wide screen, and the bistrot-voice content (« Vous avez joué [4-2-1] → 421 ») is one of the moments the player *should* feel addressed. The G13 manché banner already lands centered over the piste; the self-play toast should follow the same visual language — large, anchored over the piste, brief.
**Scope:**
- Reposition the toast from `position: fixed; right: 1.2rem; bottom: 1.2rem` to a centered overlay anchored to the *piste container* (not the viewport): `position: absolute; left: 50%; transform: translateX(-50%); bottom: 8%` inside the piste. Falls back to a centered fixed overlay on mobile (single-column layout).
- Bump width from 360 → ~520 px, padding from `0.85rem 1.1rem` → `1.3rem 1.8rem`, fontSize from the current ~0.9 rem body → ~1.05 rem (eyebrow ~0.72 rem). Keeps the brass left-border + paper background — same vocabulary as the existing banner just larger.
- Keep auto-dismiss at ~4 s with click-to-dismiss. Add a subtle bottom progress bar that drains over the 4 s so the player feels the urgency without surprise dismissal.
- Don't fight with the G13 match-end banner: if both fire on the same frame (rare — manché + self-play turn coincide), the manché banner wins and the self-play toast is suppressed. Add a guard in `Game.jsx` where `selfPlay` is set: skip the set when `matchEnd` is also non-null.
- Tests: toast renders centered over the piste; click dismisses; auto-dismiss at 4 s; manché banner suppresses the toast.
**Acceptance:** After a self-play turn (or AFK-bot turn on your seat), a clearly readable banner appears centered over the piste with the rolled combo + chip outcome + next-up text; auto-dismisses cleanly.
**Dependencies:** Should land alongside [[G14]] piste-sizing if that work moves — both depend on the piste container being a known size + position anchor.

### G52. In-game typography pass — raise text scale against the piste
**Why:** Reported. The piste dominates the screen at ~600 px+ wide, but most surrounding text (action bar, ticker cards, log entries, dice hints, RhythmIndicator) sits at 0.6–0.95 rem. Result: the page reads as a giant green table surrounded by tiny print, and players have to lean in to scan critical info during play. The fix isn't bigger fonts everywhere — it's a coordinated step up of the in-game UI scale so the *important* labels and status text feel readable from a meter away.
**Scope:**
- **Baseline shift.** Inside `Game.jsx`'s root, expose a CSS custom property `--game-ui-scale: 1.15` (configurable later via Room settings). All relative font sizes inside the game viewport multiply against this base. Cleanest path: wrap the game viewport in a `<div style={{ fontSize: 'calc(1rem * var(--game-ui-scale))' }}>` so every `rem`-based child scales together.
- **Targeted bumps** that aren't `rem`-relative today:
  - Action bar eyebrows: 0.62 → 0.78 rem
  - Action bar serif lines: 1.05 → 1.2 rem
  - Ticker card body: 0.82 → 0.95 rem
  - Ticker card eyebrow: 0.62 → 0.7 rem
  - RhythmIndicator body: 0.85 → 0.95 rem (eyebrow stays)
  - Dice keep hint: 0.85 → 1 rem, weight 400 → 500 (overlaps with G16)
  - Right-side log entries: ~0.82 → 0.95 rem; eyebrow 0.62 → 0.7 rem
  - Player strip name: 0.95 → 1.1 rem
- **Don't touch** the piste-internal labels (dice values, the central combo display) — those already scale with the piste itself.
- **Verify against narrow widths.** Run at 1024 / 1280 / 1440 / 1920 viewport widths; if 1024 starts to feel cramped at scale 1.15, drop the scale to 1.08 there via a media query rather than killing the bump entirely.
- **Theme audit.** Make sure the contrast ratios still meet WCAG AA at the larger sizes (they should, since size doesn't change color, but bigger weight on `dice_keep_hint` might tip a pale brass into low-contrast on light theme — eyeball it).
- Pairs naturally with [[G14]] (piste-sizing) + [[G16]] (in-piste hint legibility) — both touch the same neighborhood.
**Acceptance:** On a 1440-wide screen, every in-game label (action bar, ticker, log, dice hint, rhythm indicator) is comfortably readable without leaning in. The piste still dominates the layout but doesn't drown out the surrounding UI.
**Dependencies:** None, but should ship after (or alongside) [[G16]] so the dice-hint changes aren't undone.

### G53. (DONE — pending PR merge) Animate the current player's seat to signal whose turn it is
**Why:** Reported during playtest. The piste shows whose turn it is via a subtle highlight on the active seat, but the cue is weak — a player who looks away for a moment can come back unsure whether it's their turn or someone else's. The user wants a clearer animation (pulse, glow, blink) on the active *non-local* player's seat so the table reads at a glance: "their turn." For the local player's own active turn, the existing CTAs (« Lancer », « Valider ») already shout the answer — the animation matters most for *spectating* other players.
**Scope:**
- Frontend: in `PisteSeat`, when `active === true` AND `isSelf === false`, apply a CSS keyframe animation. Candidate: a soft brass pulse (`box-shadow` 0 → 12px brass-soft → 0, period ~1.4 s, infinite). Avoid full-brightness or color-shift effects — the piste is already a busy surface; this needs to read as "alive" without screaming.
- Respect `@media (prefers-reduced-motion: reduce)` — drop the pulse to a static brass ring so the affordance survives without motion.
- Active local player (your own turn) gets either nothing (CTAs are loud enough) or a much quieter version of the pulse (debate during implementation).
- Variant to consider: a small dice-shake icon next to the active seat that animates rather than the whole seat. Less visually intrusive on the ring layout.
- Tests / verification: at 2 / 3 / 5 players, the pulse is unambiguous — you can tell whose turn it is from across the room (3 m sight test).
**Acceptance:** Watching another player's turn, the active seat is visibly animated; the moment the turn passes, the previous seat goes static and the next one starts. With reduced-motion, the same information lands via a static ring instead.
**Dependencies:** Coordinates with [[G47]] — both target seat affordances; bundle the work if either is in flight.

### G54. Fix: RhythmIndicator's "Sec" rule applies only during CHARGE
**Why:** Reported during playtest. The G15 RhythmIndicator hard-codes `cap = bankRule === 'sec' ? 1 : maxThrows`, treating `sec` as a constant gameplay rule. Per the actual rules, *sec* only applies while the bank is being distributed (CHARGE) — once the bank empties (`pool == 0` → DECHARGE), the rhythm reverts to free 3 throws max. So in a sec room, the indicator currently shows « RYTHME · SEC · 1 max » throughout *all* phases, including DECHARGE where everyone has 3 throws available. Players read the wrong cap.
**Scope:**
- Pass `phase` (string from `state.phase`) into `RhythmIndicator` from `Game.jsx`.
- Compute `isSecActive = bankRule === 'sec' && phase === 'charge'` (lowercase per the serialized GamePhase). Use `isSecActive` everywhere the indicator currently uses `isSec`:
  - Eyebrow label: in DECHARGE, even sec rooms show « RYTHME · LIBRE ».
  - Cap derivation: drop the `cap = isSecActive ? 1 : maxThrows` override entirely — `maxThrows` (which is `state.max_throws` from the backend, already phase-correct, see `app/game/ws.py:272`) is the truth.
- Smoke-check: the backend already gates sec on phase (see the four `phase == CHARGE and bank_rule == "sec"` sites in `ws.py`). The fix is purely client-side display alignment.
- Update FR + EN copy if the eyebrow phrasing reads awkwardly when switching mid-match ("RYTHME · LIBRE" suddenly appears in a sec room when discharge starts — that's actually informative, but make sure the visual transition isn't jarring).
- Tests (manual): create a sec room, play through CHARGE (eyebrow `SEC`, cap 1), force bank to empty (eyebrow `LIBRE`, cap 3); reverse on a libre room (sec rule never activates, eyebrow stays `LIBRE` always).
**Acceptance:** A sec room's RhythmIndicator displays « SEC · 1 max » during CHARGE only; the moment the bank empties and DECHARGE begins, it switches to « LIBRE » with the actual throw cap.
**Dependencies:** None — small follow-up to [[G15]].

### G55. (partially DONE — pending PR merge) Bot strategy upgrade — probability-aware + decision-log
**Why:** Reported during playtest. The current bot accepts very low first-throw combos (e.g., `5-3-2`, a basic figure rank ≈ 5) when it's the round starter, because `_bot_take_turn`'s win check fires `turn.rank > target_rank and turn.rank > 0`. As the starter, `target_rank == 0`, so any non-zero rank trips the break and the bot commits its first throw without ever considering re-rolls — even when `_bot_pick_keepers` would have correctly identified the `3-2` as a consecutive pair worth keeping (rule 5) and re-rolled the 5 toward a suite. The user wants the bot to play like a human: factor in **probability** (more throws given to opponents = more chance they beat me), **strategy** (a starter should set the bar high so others can't easily match in their own throw allowance), and **luck** (still accept a great first roll instead of throwing it away).
**Scope:**
- **Starter-aware floor.** When `target_rank == 0` AND the bot is the round starter, replace the win-check with a *floor check*: only stop on a "respectable" rank. Candidate floor: a pair (rule-3 territory, rank ≥ 2200), or any suite / 11x / 421 / 111. Below that, keep iterating until throws run out. This single change fixes the `5-3-2` case directly.
- **Probability buffer when ahead but exposed.** When `target_rank > 0` AND `turn.rank > target_rank` but `rolls_left > 0`, look up `P(survives | remaining_opponents, their_throws, my_rank)` against a precomputed lookup table. If `P < 0.6`, keep re-rolling for a better cushion. Precomputed table lives in a new `app/game/bot_probability.py` — small (~few hundred entries), generated offline from `classify()` over all `6^3 = 216` dice outcomes.
- **Throw-budget pressure.** As the bot's `rolls_left` drops, raise the floor threshold: the last throw is "go for it" territory; the first throw should keep multiple paths open. Practically: rule fallthrough order in `_bot_pick_keepers` stays the same, but `_bot_take_turn` injects per-throw context (e.g. *"this is your last throw, don't keep two dice unless they're already winning"*).
- **Decision log.** Each iteration emits a server-side structured event:
  ```python
  game.log_events.append({
      "key": "log_bot_decision",
      "name": player.name,
      "throw": rolls_used,
      "dice": list(turn.dice),
      "combo": turn.combo,
      "rank": turn.rank,
      "target": target_rank,
      "action": "reroll" | "keep",
      "reroll_mask": reroll_list,
      "reason": "starter_low_floor" | "probability_buffer" | "ceiling_421" | ...
  })
  ```
  Surfaced only to spectators + the room host (or all when a debug flag is set) so regular players don't see the bot's internal monologue. This is your fine-tuning surface — replay a match, scroll the journal, see exactly why the bot did what it did.
- **Tests.** Significant test surface. Property-test: across all 216 first-throw outcomes, the bot starter never commits on a basic rank < 1000 if it has throws available. Targeted: `5-3-2` → re-rolls the 5. Targeted: `4-2-1` → commits immediately (421 ceiling). Probability buffer: feed a synthetic game state where `target_rank` is just-below a pair and `rolls_left == 2` — bot should NOT stop on a marginal win.
- **Future hook for ML.** The decision-log format is intentionally JSON-shaped so a follow-up could train a small policy network from replay data. Out of scope for v1; mentioned so the field names don't paint the bot into a corner.
**Acceptance:** Manual playtest: bot as starter rolls 5-3-2 → re-rolls the 5 (rule 5 fires); bot mid-cycle marginally beating target → uses remaining throws to widen the lead; bot's decision log entries appear in the journal for inspection.
**Dependencies:** None for the core fix. The probability table is a self-contained module. The decision-log surfacing depends on choosing the right audience (debug-flag vs spectator-only) — pick during implementation.

### G56. (DONE — pending PR merge) Hold the dice on the piste through a play-validate transition
**Why:** Reported during playtest. When the player's turn validates — manual « Valider », auto-validate at max throws (G3), or end-of-match cycle resolution — the piste's dice display resets to blank and the cycle advances on the same broadcast frame. The toast (G23 `SelfPlayToast`) fires, but it's the small bottom-right card; the player's eye is on the piste, and by the time they look down, the toast is mid-fade. Net effect: the player just played, but they never see what they played before everything moves on. Especially bad at end-of-match where the G13 banner takes the centered slot and suppresses the toast entirely.
**Scope:**
- **Server-side delay.** After a turn validates (player called `done`, auto-validate fired, or AFK-bot finalized), instead of immediately calling `advance()` + broadcasting the next state, sleep ~1.5 s on the broadcast that holds the validated dice on the piste, *then* advance + broadcast again. Mirrors the [[G2]] bot-handback grace pattern but on the human side. A subsequent play action from the *next* player short-circuits the sleep.
- **Visual treatment.** During the 1.5 s hold, the validated dice stay on-piste, dimmed slightly, with the combo + chip outcome surfaced in a centered ribbon (« 421 · 8 fiches sent to the pool » or « basic · -1 to Player1 »). After the hold, dice clear and the next player's turn begins.
- **Match-end interaction.** At end-of-match the G13 banner already provides a 4.5 s pause before resetting — that natural hold *should* cover the last-play visibility, but verify by playtest. If the validated dice clear before the banner appears, add an additional dice-hold flag to the manché path.
- **Auto-validate specifically.** Currently G3 auto-validate fires synchronously in the `roll` handler when `rolls_used >= max_throws_this_round`. The hold pattern needs to run after this synchronous call returns — i.e. the server emits an interim "play complete, dice held" state, then a deferred final state after the sleep.
- **Skippable.** A short `?` next to the dice ("→") lets the player skip the hold and advance immediately. Power-user affordance for fast play.
- **Bundles with [[G51]]** (SelfPlayToast bigger + centered) — together they ensure the player sees their play *both* on the piste and in the toast.
- **Doesn't break the bot path.** [[G2]]'s `BOT_HANDBACK_GRACE_SECONDS` already holds the bot's play for 3 s. G56 adds the same affordance for human plays.
**Acceptance:** Player rolls their final throw → the dice + combo stay visible on the piste for ~1.5 s with a centered chip-outcome ribbon → then the next player's turn renders. Works identically for manual validate, auto-validate, and AFK-bot turns. End-of-match plays remain visible through the G13 banner overlay.
**Dependencies:** Bundles with [[G51]] (bigger toast) and benefits from [[G14]] (piste sizing) since the centered ribbon competes for space with the dice area.

### G57. Tiebreak AFK bot fallback (CRITICAL — game can hang)
**Why:** Reported during playtest. The tiebreak phase has no AFK fallback. If a tied player goes idle while waiting for their tiebreak throw, the game stalls indefinitely — no timer fires, no bot plays for them, the next tied player can't act because `game.tiebreak.next_pid` never advances. Two AFK players in a tiebreak = stuck game. Compare CHARGE/DECHARGE which auto-resolve via `_afk_timer` → `_bot_take_turn`.
**Scope:**
- A `_afk_tiebreak_timer` helper already exists at `app/game/ws.py:480` per a grep — confirm whether it's wired or just defined. If unwired:
  - Schedule it whenever `game.tiebreak.next_pid` changes, mirroring how `_schedule_afk` rearms on each turn.
  - On timeout, roll three dice for the tied player, log a `log_tiebreak_throw` event with `(AFK)` annotation, advance `next_pid` to the next tied player, and call `_resolve_tiebreak` if this was the last throw.
- Add `_cancel_afk` for tiebreak timers when the human takes the throw themselves (or leaves / is kicked).
- Apply the [[G56]] piste hold to the bot's final tiebreak throw too so the resolution doesn't flash by.
- The bot's tiebreak throw should be a single random roll — no `_bot_pick_keepers` heuristic (tiebreak is a single all-three-dice roll per the rules; no rerolls).
- Tests: `test_afk_tiebreak_timer_fires`, `test_afk_tiebreak_resolves_when_last_tied_player_idle`, `test_cancel_afk_drops_tiebreak_timer`.
**Acceptance:** Tied players who AFK during tiebreak get auto-rolled by the bot after the timer fires; the tiebreak resolves and the cycle continues. Game cannot hang on idle tiebreak players.
**Dependencies:** None. Pure backend fix. Bundles cleanly with [[G55]] (bot strategy) since both touch bot behavior.

### G58. Investigate why `log_afk_return` isn't visible in playtest
**Why:** Reported during playtest. After G50 introduced the `log_afk_return` event for post-grace return from AFK, the user expects to see a « ↩ {name} est de retour à la table. » card in the ticker when they reclaim play outside the bot-handback window. They still haven't seen it.
**Scope:**
- **Hypothesis 1: the user always returns DURING the 3-second grace window.** The G2 path then fires `log_bot_handback` instead of `log_afk_return` — and the wording is different (« reprend la main avant la fin du tour du bot »). Both events appear in the ticker, but with different copy. If this is the case, the fix is wording-only: align the two events' phrasings (or merge them).
- **Hypothesis 2: `afk_session` is being cleared spuriously.** The `_abort_bot_handback` discard branch runs on every reconnect (`app/game/ws.py:1110`), even when no handback is pending — but only past the early return. Double-check the discard truly sits below the early-return guard; if not, the set gets emptied without the event ever firing.
- **Hypothesis 3: the `elif` branch is shadowed.** Confirm `_HANDBACK_PLAY_ACTIONS` actually matches what the user sends on return (e.g., a stale `keep` from the previous turn doesn't count as "returning"). Add server-side debug logging temporarily.
- **Verification approach:** add a `logger.info("afk_session state pre-dispatch: %s, action: %s", ...)` line at the top of `_dispatch`, replay the AFK scenario, read logs.
- Once the cause is known, the fix is small (rewording, ordering, or a missed action key). Don't merge the diagnostic logging — it's noisy.
**Acceptance:** A player goes AFK, the bot plays several turns, the player returns and clicks roll. A « ↩ {name} est de retour à la table. » card appears in the ticker. The G2 in-grace path still emits `log_bot_handback` for its narrower case.
**Dependencies:** None.

### G59. Restructure in-game info surfaces — gameplay feed left, chat right
**Why:** Captured for future. Today the in-game UI has two information panels: a **right-side journal** with every log event (useful for debugging, but visually heavy) and a **left-side ticker** (the « En Direct » feed, currently showing only filtered headlines). When chat ships ([[item 8]] + [[G34]] + [[G36]] + [[G37]]), it needs a permanent home, and the right-side journal is the most natural slot — it's already a scrolling text column. But losing the journal means the left ticker must absorb *all* essential gameplay information, becoming the single source of truth for what's happening at the table.
**Vision (target end-state):**
- **Left ticker = full gameplay feed.** Replaces the current minimal headline filter with a richer per-cycle stream:
  - Round start: « Tour 4 · Sierra donne le rythme »
  - Each player's submitted play, in turn order starting with the rhythm-setter:
    - « Sierra a joué un **421 en 3 lancers** » (the rhythm-setter; explicit throw count)
    - « June a joué **1-1-4 (114)** · 114 to beat for 8 fiches » (a follower, with the "score to beat / chips in play" rolled in)
  - Tie detection: « Égalité entre Sierra et June à 114 — départage en cours »
  - Tiebreak throws as they land: « June (départage) : 632 → 1f »
  - Cycle resolution: « June prend 8 fiches · Banque : 3 » / « Sierra donne 2 fiches à June »
  - Phase transitions, sit-outs, manchés, round points — all surfaced here.
  - "Score to beat" line auto-updates as new plays push the bar.
- **Right column = chat (future).** Replaces the current right-side journal once chat ships. Same width, same scroll behavior; users gain real-time chat with their tablemates. Moderation (G34 / G36 / G37) gates message visibility.
- **Debug/dev access to the raw log.** The user values the raw event log for debugging — preserve it via a `/devtools` route or a host-only "Show event log" toggle that opens an overlay. Not in the default play layout.
**Scope (sketch only — not for immediate implementation):**
- Backend: expand HEADLINE_KEYS in `CommentaryTicker.jsx` toward "include everything that matters" rather than "include only the highlights." Likely additions: `log_turn`, `log_charge_takes`, `log_decharge_gives`, `log_round_start`. Drop the dedup-collapse for non-AFK events (each play is its own announcement).
- Backend: emit a new `log_score_to_beat` event whenever a play raises the highest rank in `current_round_plays`, so the ticker can render the "X to beat for Y fiches" line without re-computing client-side.
- Frontend: a new card variant in `TickerCard` for player plays — more visual presence (small dice glyph + combo name + chip outcome). The "headline" cards (manché, pool empty, tiebreak start) keep their existing accent treatment.
- Frontend: right-side `<aside>` swaps `<LogPanel>` → `<ChatPanel>` once chat ships. Until then, leave the journal in place as the dev/debug view (or add the host-only toggle).
- Grid: today is `260px 1fr 320px`. With chat ascending to first-class status, may need to widen to `320px 1fr 380px` so both side rails have breathing room.
- **Coordinate with [[G50]]:** the ticker dedup logic stays for AFK events (one card per session) but doesn't apply to plays — each play is unique by design.
**Acceptance:** A player can follow the entire game without ever looking at the right column. The ticker tells them whose turn it is, what each played, the running score-to-beat, and the cycle outcome. When chat ships, the right column becomes the chat surface.
**Dependencies:** [[item 8]] (chat), [[G34]] (AI moderation), [[G36]] (rate-limiter), [[G37]] (peer reporting) — all need to land before the right-column flip. The ticker enrichment can ship first, independent of chat, as a pure UX upgrade.

### G60. Persist the game session across page refreshes
**Why:** Reported during playtest. Refreshing the page mid-game drops the player back to an empty home/lobby instead of resuming their seat at the table. The backend already keeps the `Game` in-memory (it survives any single client refresh; the WS just closes and the player's `connected` flips False until reconnect), so the gap is purely client-side: the frontend doesn't remember which game it was just in, so after refresh it has nowhere to navigate.
**Scope:**
- **localStorage handshake.** When `Game.jsx` mounts with a valid `gameId` + `playerId` from the URL, write `{gameId, playerId, name, token}` to `localStorage.last_session` (TTL via a `created_at` timestamp; clear if older than ~6 h since rooms don't usually outlive that). When a `leave` action fires (or the game's `FINISHED` phase is reached), clear `last_session`.
- **Home / Lobby rehydration.** On `/` (home) mount, check `localStorage.last_session`. If present + not stale, ping `GET /api/games/{gameId}` (a new lightweight endpoint that returns 200 with the game's phase + the player's `connected` flag, or 404 if the room is gone). If the room still exists AND the player is still in `game.players`, render a banner: « Reprendre votre partie en cours · {room_code} · {N} joueurs » with a primary CTA to navigate to `/game/{gameId}?pid={pid}` and a secondary "Quitter cette partie" that clears the session + posts an explicit leave.
- **Direct-URL refresh** (already works partially): `/game/:gameId?pid=...` does preserve the pid through refresh, but the WS reconnect path must handle the case where the player's `connected` was False and re-engage them cleanly. Verify against current code; if there's a gap, the `websocket_endpoint` already calls `_abort_bot_handback` + broadcasts state on reconnect, which should be sufficient.
- **Stale-session UX.** If the GET returns 404 (room dissolved) or the player isn't in the roster anymore, surface a one-time toast on home: « Votre dernière partie n'est plus active. » Clear localStorage.
- **Guest token handling.** Guest sessions store the random `playerId` only — no JWT. Registered users also store the JWT, which can refresh-validate via `/auth/me` on mount; if the token is expired, clear the session.
- **Tests:**
  - Backend: new `GET /api/games/{game_id}/info` returns phase + connected map for valid game, 404 for missing.
  - Frontend (manual): refresh during CHARGE → land back in the same game; refresh after `leave` → no rehydration banner; refresh after the room is dissolved → stale-session toast.
**Acceptance:** A player in an active game refreshes their browser tab and returns to the same game state — same seat, same dice in front of them, same turn order. If the room ended/dissolved during their absence, they see a one-time explanatory toast and a clean home page.
**Dependencies:** None for the v1 flow. Pairs with [[G11]] (single-player searching modal) — both target session continuity. Could later be extended to "reconnect across devices" but that needs proper auth-token-as-session-key.

### G66. (DONE — pending PR merge) Default bank rule should be « Libre » (au choix du donneur)
**Why:** Reported during playtest. The room-creation form currently defaults the bank rule to « Sec jusqu'à banque vide » (single throw for everyone during charge). The user expects « Au choix du donneur » (libre / free) as the default — it's the standard 421 experience where the round starter sets the rhythm and others match. Sec is a special-case shortcut for fast play with many players, not the canonical rule.
**Scope:**
- Backend: `Game.bank_rule` default is already `"free"` (`app/game/logic.py:131`), so the backend is correct.
- Frontend: `CreateRoom.jsx` — wherever the form initializes `bankRule` state (look for `useState('sec')` or similar; needs verification), flip the default to `'free'`. The two-option toggle still presents both choices; just the *pre-selected* default changes.
- Verify: opening the create-room page → « Au choix du donneur » is the radio that's checked by default.
**Acceptance:** Creating a new room without changing the distribution option produces a libre room (`bank_rule === 'free'`).
**Dependencies:** None. One-line fix.

### G67. (DONE — pending PR merge) Numeric inputs accept keyboard entry (not just up/down arrows)
**Why:** Reported during playtest. The AFK timeout `<Stepper>` (and likely the max-players stepper too) requires tapping the up/down arrows to change the value. The user wants to type a value directly via keyboard — much faster than clicking from 15 to 60 in 5-second increments.
**Scope:**
- Find the shared `Stepper` component (or wherever AFK timeout + max-players are rendered as numeric inputs).
- Replace the arrow-only stepper with an `<input type="number" min={...} max={...} step={...}>` that also accepts typed values. Keep the visual increment buttons for tap users (good mobile UX) but make the central field editable.
- Validate on blur: clamp to `[min, max]` (AFK: 15 ↔ 60s; max-players: 2 ↔ 5). If the typed value is out of range, snap to the nearest bound and flash a brief tooltip.
- Keep keyboard arrow keys working when the input is focused (up/down adjusts by `step`).
- Apply to: AFK timeout, max-players, anywhere else a stepper appears (search for the component / pattern).
**Acceptance:** On the create-room and (future [[G45]]) edit-room-rules forms, the user can either tap up/down OR click the number and type a value. Out-of-range typed values clamp on blur with a visual cue.
**Dependencies:** None. Light-touch frontend change.

### G68. (DONE) RGPD consent — Contact form checkbox + Register links Privacy too
**Why:** The Privacy.jsx page already covers all 7 RGPD-required sections (data controller, collected data, purposes, retention, your rights, cookies/storage, DPO contact). Two gaps remained: (1) the Contact form had no consent checkbox, so users were submitting personal data (name, email, free-text message) without an explicit data-processing opt-in; (2) the Register form's consent checkbox only linked to `/terms`, so users weren't being told they were also agreeing to the Privacy/RGPD policy.
**Scope shipped:**
- `Contact.jsx`: new required consent checkbox linking to both `/privacy` and `/terms`. Submit button gated until checked + JS belt-and-suspenders check before POST. Error message in FR/EN if the user manages to bypass the `required` flag.
- `Login.jsx` (RegisterForm): existing `accept-cgu` checkbox text expanded to link to both `/terms` AND `/privacy` via new `accept_terms_and` + `accept_privacy_link` i18n keys.
- New FR/EN i18n keys: `contact_consent_pre`, `contact_consent_privacy_link`, `contact_consent_and`, `contact_consent_terms_link`, `err_accept_consent`, `accept_terms_and`, `accept_privacy_link`.
**Acceptance:** Sending a contact message without checking the consent box → error + no POST fires. Registering → checkbox text mentions both Terms AND Privacy with both links working.
**Dependencies:** None.

### G69. (DONE) Privacy & Terms content expansion + EN translation
**Why:** Reported during the G68 verification. Privacy.jsx was hard-coded French and never switched to English — the visible page stayed in French even when the user's language was set to EN. Terms covered the basics but had no explicit conduct rule list, no mention of host moderation discretion (G24 kick), and no description of the strike-escalation flow (G38 schema). The user wanted the legal pages to actually reflect what's implemented.
**Scope shipped:**
- `Privacy.jsx` rewritten with i18n keys; new full EN translation. New section 7 « Modération et journalisation » documenting the audit log (host kicks, warnings, suspensions, bans, IP retention).
- `TermsAndConditions.jsx` expanded:
    * Section 2 now lists explicit prohibited behaviors (harassment, hate speech, sexual content, spam, impersonation, doxxing, cheating).
    * New section 5 « Modération par les hôtes de salle » documents the host's kick + report powers and the misuse policy.
    * New section 6 « Application des règles & échelle des sanctions » spells out the 3-strike progression (warning → temp suspension → long ban) and the immediate-permanent path for severe offenses (French law violations).
    * Existing sections renumbered.
- New FR/EN i18n keys (~50): all `privacy_s*_*` + `terms_community_rule_*` + `terms_host_*` + `terms_enforcement_strike*` keys.
**Acceptance:** Switching language flips both Privacy and Terms between FR and EN. Terms accurately describes the kick/report flow + strike progression that's actually live in the codebase. Privacy mentions the moderation audit log.
**Dependencies:** None. Content is grounded in what's actually built (G24 kick, G38 strike schema, GdprAuditLog) — no aspirational features described.

### G70. Inactive-account auto-deletion pipeline (RGPD compliance)
**Why:** RGPD's data-minimisation principle requires that we don't keep personal data longer than necessary. Indefinitely retaining dormant accounts both violates this principle and increases blast radius if the database is ever compromised. The Privacy policy (section 8) commits to a 2-year inactivity + 30-day grace deletion flow; this entry tracks the actual implementation.
**Scope:**
- **Schema**: add `User.last_login_at: datetime` column (already implicit via `last_login_ip` if it exists — check). Update on every successful auth: `/auth/login`, Google SSO callback, and remember-me refresh.
- **Inactivity sweep**: nightly cron (Celery beat or a plain cron + management command) that finds users where `last_login_at < now - 2y` AND `deleted_at IS NULL` AND `inactivity_warned_at IS NULL`. For each match:
    * Send a templated email (« Votre compte 421 Bistro va être supprimé dans 30 jours ») via the existing Resend pipeline. Subject + body in the user's `lang_pref`.
    * Stamp `inactivity_warned_at = now` so we don't spam them.
- **Deletion sweep**: same cron, finds users where `inactivity_warned_at < now - 30d` AND no login since then → run the existing soft-delete pipeline (`/auth/me DELETE` flow). Hard-delete from `users` table after the standard 30-day grace window, drop their `GdprAuditLog` rows older than 365d, anonymise game history.
- **Recovery path**: a login between `inactivity_warned_at` and the deletion sweep clears `inactivity_warned_at` and resets the clock. Add a banner on `/profile` if the user is currently in the warning window.
- **Admin override**: G73's admin dashboard exposes a list of "users in warning window" so I can spot-check the queue before the deletion fires.
- **Tests**: unit for the sweep selectors; integration for the end-to-end warned → login resets → deletion-skipped flow.
**Acceptance:** A test account with `last_login_at = 2y+1d` ago receives the warning email, has its `inactivity_warned_at` stamped. 30 days later (or simulated with frozen time) the account is soft-deleted; 30 days after that, hard-deleted.
**Dependencies:** Existing Resend pipeline (already wired for password resets). Backend cron infrastructure decision (Celery vs. simple cron + management command — pick the simplest that handles failure restart).

### G71. Data breach detection + user notification pipeline (RGPD Art. 33-34)
**Why:** RGPD Article 33 requires reporting confirmed personal-data breaches to the CNIL within 72 hours; Article 34 requires notifying affected users without undue delay if the breach is likely to result in high risk to their rights. Privacy section 9 commits to both; this entry tracks the actual response playbook + tooling.
**Scope (two halves: detection and response):**
- **Detection** (signal sources):
    * Sentry alerts on unauthorised access patterns (existing Sentry SDK wiring captures errors; needs a rule for "auth events with anomalous IPs/UAs").
    * Failed-login spike detector (cron-aggregated count over a sliding window) — if >100 failures from <10 IPs in 1h, raise an incident.
    * Database access audit (Postgres `pg_stat_activity` snapshot, log diff against expected app connections).
    * Manual incident trigger via admin endpoint `POST /api/admin/incidents/declare` for cases we hear about externally.
- **Response playbook** (documented in `docs/INCIDENT_RESPONSE.md`, not just code):
    * Incident table `Incident(id, detected_at, declared_at, declared_by, scope_estimate, affected_users_count, status, cnil_reported_at, users_notified_at, resolution_summary)`.
    * Affected users list scoped per-incident (could be all users, all users with passwords created before date X, all users from a specific IP range, etc.).
    * Automated email to affected users using a templated message (subject, scope, recommended actions). Body assembled from the incident's `scope_estimate` field, the data fields known to be exposed, and the standard "change password, review activity, enable 2FA when available" recommendations. Email rendered in the user's `lang_pref`.
    * CNIL reporting endpoint stub — actual filing happens via their portal; the system stores the filing reference number.
- **Tests**: incident creation, notification rendering with each scope flavor, idempotency (re-running shouldn't double-email anyone).
**Acceptance:** Admin declares an incident with scope "all users registered before 2026-01-01". The system enumerates affected users, queues the notification emails (templated, localised), records the timestamps, and exposes a status page at `/admin/incidents/{id}`.
**Dependencies:** Existing Resend pipeline. Sentry SDK already wired. New `Incident` table + Alembic migration. Pairs with [[G73]] (admin UI surfaces the incident state).

### G71b. Security hardening + intrusion detection (defensive baseline)
**Why:** Even with G71's incident response, the goal is to never need it. Today the codebase has light protections: H1 caps WS message size, the `limiter` slowapi middleware rate-limits some endpoints, FastAPI's Pydantic validation blocks most injection patterns. Gaps to close before opening to a wider audience.
**Scope:**
- **OWASP audit checklist** (`docs/SECURITY_AUDIT.md`): walk the OWASP Top 10 and document where each protection lives.
- **SQL injection**: SQLAlchemy parameterised queries are the default everywhere — confirm with a `grep -r "f\".*WHERE.*{" app/` audit. No raw string interpolation into SQL.
- **XSS**: React's JSX auto-escapes; confirm no `dangerouslySetInnerHTML` in components. Any new chat / user-content surface must use a sanitiser.
- **CSRF**: the API is bearer-token based, not cookie-session, so CSRF is structurally moot for `/api/*`. Document this so future cookie-session work doesn't reintroduce it.
- **Rate limiting**: extend `limiter` to cover `/auth/login`, `/auth/register`, `/auth/forgot-password`, `/api/contact`. Per-IP + per-account. Current state — check what's actually limited.
- **Brute-force protection**: lockout after 10 failed logins / 15 min / IP. Track in Redis once we have it, in-memory dict before.
- **Header hardening**: CSP, X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, HSTS in production. Add a Starlette middleware.
- **Dependency scanning**: GitHub Dependabot or Snyk on the repo; track + remediate vulnerabilities monthly.
- **Audit logging**: every admin action via `GdprAuditLog`-style row. Already exists for role changes; extend to G73's user-edit actions.
- **Secrets hygiene**: confirm no secrets in commit history (`git log -p --all | grep -i "secret\|key\|password" | head`). All env-driven (`.env` already in `.gitignore`).
**Acceptance:** SECURITY_AUDIT.md documents the protection per OWASP item with code references. CSP + security headers visible in browser dev-tools network response.
**Dependencies:** None for the audit doc; some items (Redis, Dependabot) need infrastructure decisions.

### G72. Admin user management UI
**Why:** I'm the sole admin today (`role="admin"`); when a real user runs into trouble, an issue I need to fix, or a request comes in via the contact form, I need a UI to find that user, see their full record, and act. Today the admin dashboard exposes only the dashboard-summary + role-change endpoints — no list, no search, no detail view.
**Scope:**
- **Backend**: new admin endpoints, all gated by `require_admin`:
    * `GET /api/admin/users` — paginated list with filters (`?q=username|email`, `?role`, `?banned=true`, `?inactive=true`, `?page=1`). Returns `{items, total, page, page_size}`.
    * `GET /api/admin/users/{id}` — full record: account fields, role, strike_count, ban state, last_login, recent games, recent moderation actions, ip history.
    * `PATCH /api/admin/users/{id}` — multi-field update: username, email, lang_pref, theme_pref, role (already exists separately, fold in here), strike_count reset, ban_until clear, chat_ban_until clear. Audited via `GdprAuditLog`.
    * `DELETE /api/admin/users/{id}` — hard delete with confirmation token (admin must type the username to confirm).
- **Frontend**: extend `AdminDashboard.jsx`:
    * New tab « Utilisateurs » with the paginated table + filter chips.
    * Detail panel (drawer or sub-route `/admin/users/{id}`) with all fields editable inline + a danger-zone footer for delete.
    * Audit-trail strip at the bottom of the detail panel: "12 May 2026 — strike +1 (G34 hate_speech, auto)".
- **A11y**: filter inputs labelled, table rows keyboard-navigable, destructive actions require explicit confirmation.
**Acceptance:** I can search "sierra", see my own account row, click in, see all my fields + a list of any moderation actions, edit my username, and (theoretically) delete a test account with the username-typed confirmation.
**Dependencies:** [[G38]] (admin role + dashboard surface) — extends it.

### G73. Admin moderation review UI
**Why:** When a sanction is applied automatically by G34/G37 (or manually via G24/G32), I need to see *what triggered it* — the original message, the report context, the AI verdict + confidence, the dice of similar incidents — so I can confirm the system is acting reasonably and overturn false positives. Bans without context are unauditable.
**Scope:**
- **Backend** (some of this overlaps with G39 "moderation inbox" — reuse those tables):
    * `GET /api/admin/moderation/sanctions` — list of all sanctions ever issued, paginated, filterable by user / kind (warn/temp/perm) / source (auto/manual) / status (active/expired/overturned).
    * `GET /api/admin/moderation/sanctions/{id}` — full context: the `ModerationReport` that triggered it, the `ChatModerationLog` rows or `MessageReport` row, the AI verdict + confidence + rationale, the user's strike history, the IP at offense.
    * `POST /api/admin/moderation/sanctions/{id}/overturn` — admin can clear the sanction; cascades to clear strike_count increment, unban, restore chat access. Audited.
- **Frontend**:
    * New tab « Modération » with two sub-panels:
        - **Active sanctions** — current bans, mutes, warnings. Each row clickable into the detail view.
        - **Recent decisions** — last 100 sanctions (any status), so I can spot-check trends.
    * Detail view shows the full context (above) + an « Annuler la sanction » button (with confirmation modal).
    * Threading: if a sanction stems from multiple reports, show all of them.
- **Tests**: list endpoint pagination, detail enriches with linked records, overturn cascades correctly + audits.
**Acceptance:** A sanction created (auto or manual) is visible in the list within a few seconds; clicking it shows the original triggering content; I can overturn it and the strike_count + ban state revert.
**Dependencies:** [[G34]] / [[G37]] / [[G39]] supply the underlying schema. Some of this lives in G39 already; this entry is the user-facing surface.

### G74. AI chat moderation with delayed-send pattern
**Why:** [[G34]] already plans an AI classifier that runs in the request path. The user explicitly asked for a *delayed-send* variant: the chat message doesn't appear immediately; it's held for ~1-2s while the classifier runs, and only relayed if clean. This prevents the "send → flash → ban" race where harmful content briefly appears.
**Scope (refinement of G34):**
- WS chat action `chat_send` queues the message in a per-room delay buffer instead of broadcasting immediately.
- Background task calls the Claude Haiku classifier; on safe → broadcast; on block → drop + notify sender.
- Latency budget: classifier p50 should be < 800ms so the delay is felt as "thinking" not "broken". If the classifier times out (>1.5s), fall back to the regex deny-list AND mark the room as "moderation degraded" for ops.
- The delay applies only when the room has chat enabled AND moderation isn't bypassed (e.g., admin-room).
- UI: the sender sees their message immediately in a "pending" state (italic, grey, with a small clock icon). When clean, it transitions to normal; on block, replaced with a strikethrough placeholder + the rule-violation toast.
- Trade-off acknowledged: the small latency hurts conversation flow but eliminates the "harm window". Default ON; future flag to disable per-room if a friends-only private room wants raw chat.
**Acceptance:** A clean message round-trips in <1.5s with a brief pending state; a slur is held, dropped, and never relayed to other clients.
**Dependencies:** [[G34]] is the parent; this entry is the delayed-send variant the user asked for specifically.

### G75. Buy + verify the production domain (Cloudflare Registrar, ~€8/yr)
**Why:** Email sending through Resend (and the upcoming Brevo migration in [[G76]]) requires a verified sender domain — DNS records (SPF, DKIM, DMARC) must be set before any transactional email reliably lands in inboxes. Same domain becomes the canonical site URL once deployment lands. Currently `noreply@421bistro.fr` is hard-coded in the email-sender default but the domain isn't owned, so every contact-form submission currently 502s with `email_sender_not_configured`.
**Scope:**
- Pick a domain name. Shortlist worth considering:
    * `421bistro.fr` — matches the existing branding, French TLD makes legal/GDPR positioning obvious.
    * `421bistro.com` — international fallback; slightly pricier per year.
    * `aubistro421.fr` / `le421.fr` — alternatives if the primary is taken.
- Register via **Cloudflare Registrar**: at-cost pricing (no markup, no upsells), 1-year minimum, free WHOIS privacy. ~€8/year for `.fr`, ~€10 for `.com`. No multi-year lock-in.
- Once registered, point DNS at Cloudflare (free tier) — built-in DDoS protection, CDN, and Workers slot becomes available for future edge work.
- Add SPF, DKIM, DMARC records (Brevo / Resend provides them during sender verification).
- Update `SENDER_EMAIL` in `.env` + production env: `noreply@<domain>`.
**Acceptance:** Domain owned, DNS at Cloudflare, sender verified in the chosen email service, `/api/contact` POST succeeds end-to-end with a real email landing in `CONTACT_EMAIL`'s inbox.
**Dependencies:** None — pure ops decision. Unblocks [[G76]] (Brevo migration) and is a prerequisite for [[G77]] (production deployment).

### G76. Migrate transactional email from Resend to Brevo
**Why:** Brevo (formerly Sendinblue) has a free tier of 300 emails/day forever vs. Resend's 100/day free tier capped at 3000/month. Brevo's template editor is also nicer for the password-reset / inactive-account-warning / breach-notification templates that G70 + G71 will need. EU-based (Paris HQ) which simplifies GDPR processing-agreement paperwork.
**Scope:**
- Sign up at Brevo, verify the domain from [[G75]] (DKIM + SPF records).
- Replace the `resend` package with Brevo's Python SDK (`sib-api-v3-sdk`) or just `httpx` against their REST API — REST is cleaner and avoids the heavy SDK.
- Update `app/services/email.py`: rename `_send` to point at Brevo's `POST /v3/smtp/email`. Keep the same `(to, subject, html)` signature so callers don't change.
- Migrate the existing password-reset template + add stubs for the 3 templates G70/G71 will need (`inactive_warning`, `account_deletion_confirmed`, `data_breach_notice`).
- New env vars: `BREVO_API_KEY`, `BREVO_TEMPLATE_*` for each transactional. Drop `RESEND_API_KEY`.
- Tests: mock the HTTP call (no live Brevo dependency in CI).
**Acceptance:** Password-reset email + contact-form forwarding work via Brevo. Old Resend code removed.
**Dependencies:** [[G75]] (domain ownership).

### G77. Production deployment — Fly.io + Neon Postgres + monitoring
**Why:** All the policy work and config plumbing assumes a real deployed surface. Picking a host with WebSocket support (the game's lifeblood), EU region availability (RGPD comfort), and pay-as-you-go pricing keeps the early-stage bill low while leaving room to scale.
**Scope:**
- **Hosting**: **Fly.io** (`cdg`/`fra` regions = Paris/Frankfurt). Free tier covers 3 small VMs + 3 GB persistent volumes — enough for dev + staging + early prod. Native WebSocket support, no proxy quirks. `fly launch` reads the existing Dockerfile.
- **Database**: **Neon** (serverless Postgres). Free tier: 3 GB storage + 191.9 compute-hours/mo (more than enough for low-traffic early prod). EU region available. Branching (DB-per-PR) is a nice future-G63-audit follow-up. Alternative: Fly.io's managed Postgres ($15/mo for the smallest instance) if we want everything in one provider.
- **CDN / WAF**: **Cloudflare** (free tier already in [[G75]]) — DDoS protection, edge caching for the frontend bundle, rate limiting that complements G71b's app-layer brute-force protection.
- **Monitoring stack**:
    * **Sentry** (already wired) — errors + performance traces.
    * **Logfire** (Pydantic team's observability product) — structured Python logs, free tier covers our volume.
    * **UptimeRobot** or **BetterStack** — uptime monitoring, free tier covers 1 monitor at 5-minute interval.
    * **Plausible** or **Umami** — privacy-friendly analytics, both have free tiers. Plausible is paid-hosted (~€9/mo); Umami self-hosts free.
- **Deploy workflow**: extend the existing GitHub Actions CI to a `deploy` job that runs on push to `main` (already partially wired — the Docker build step exists). Add `flyctl deploy` on success.
- **Secrets management**: Fly.io's `fly secrets set` for production env vars; never check `.env` files into git (already gitignored).
- **Cost estimate** for the early-stage stack:
    * Fly.io: $0–15/mo depending on traffic
    * Neon: $0 (free tier)
    * Cloudflare: $0 (free tier)
    * Sentry: $0 (developer plan, 5K errors/mo)
    * Logfire: $0 (free tier)
    * UptimeRobot: $0 (free tier)
    * Domain: ~€8/yr
    * **Total: ~€0.70/mo + €8/yr = ~€1.40/mo** at the very early stage. Scales linearly past the free tiers.
- **Stretch goal**: write a `docs/RUNBOOK.md` covering deploy, rollback, scale-up, common incidents.
**Acceptance:** `git push` to `main` triggers a build + deploy; the deployed app is reachable at `https://<domain>`; monitoring dashboards show errors/uptime/latency in real time.
**Dependencies:** [[G75]] (domain), [[G76]] (Brevo for email-sending from the deployed surface). [[G71b]] (security hardening) is logical to land before opening the URL to the public.

### G78. Redis-backed shared game state (multi-container HA)
**Why:** Game state today lives in `app/game/state.py:games` as an in-process dict. Two consequences: (1) a container crash loses every active room on it, and (2) you can't run more than one container because each would have its own isolated `games` dict — players in the "same" game id but routed to different containers would see different state. Sticky sessions ([[G77]] Phase 2) mitigates this but doesn't solve the crash-loss case. The real fix is moving state to a shared store so any container can resume any game.
**Scope (Phase 3 of [[G77]]):**
- **Redis** as the state store (managed Upstash or Fly.io's Redis add-on, ~$5/mo at small scale).
- Refactor `state.games` to a Redis-backed proxy: `Game` instances serialised as JSON, fetched/written per WS message. Keep an in-process cache with TTL for hot paths.
- AFK timers + bot handback tasks become Redis sorted-set scheduled jobs OR move to a small Celery worker tier.
- Connection manager (`manager` in `app/game/ws.py`) broadcasts via Redis pub/sub so a player on container A can receive a broadcast triggered by a player's WS write on container B.
- Tests: a 2-container integration test (compose) verifying game state survives a container restart.
- Cost trigger: do this when concurrent rooms exceed ~20 OR when a real user reports a crash-induced lost game.
**Acceptance:** Kill the container hosting a live game → players see a momentary disconnect, then the same game resumes when their WS reconnects (to any container). Zero lost state.
**Dependencies:** [[G77]] (production deploy first; can't validate without a real multi-container setup).

### G79. Multi-game architecture refactor (when adding game #2)
**Why:** The codebase today assumes one game type. `app/game/` is hard-coded singular; `Game` dataclass, WS actions (`roll`, `keep`, `done`, `tiebreak_roll`), `/api/create` schema params (`bank_rule`, `afk_seconds`), `app/schemas/rankings.py` combined stats, and the frontend dice/piste rendering all bake in 421-specific concepts. Adding a second game (Belote, Tarot, Yams, etc.) without restructuring means duplicating room/player/persistence logic — a maintenance trap.
**Scope (executed in the same PR as the first commit of game #2, not preemptively):**
- Restructure the backend to a per-game-type namespace:
    ```
    app/games/
    ├── _common/        # Player, Room, PhaseEnum, matchmaking, persistence shell
    ├── _421/           # 421 logic moved here
    │   ├── logic.py
    │   ├── ws_actions.py
    │   ├── classify.py
    │   └── room_config.py
    ├── <game2>/
    └── registry.py     # game_type → module mapping
    ```
- DB schema: add `Game.game_type: str` column (default "421" for existing rows), migrate `bank_rule` / `afk_seconds` / etc. into a polymorphic `room_config: jsonb` field.
- WS routes: `/ws/{game_type}/{game_id}/{player_id}` — game type discriminates which `ws_actions` module handles incoming messages.
- HTTP routes: `/api/games/{game_type}/create` similarly.
- Frontend: split `Game.jsx` per game type, with a thin `<GameRouter>` that switches on `state.game_type`. Shared primitives (`PisteSeat`, `ChipStack`) move to `frontend/src/components/games/_common/`.
- Migration plan: ship game #2 + the refactor as one PR with a feature flag. Old `/api/create` keeps working for back-compat for at least one release.
**Acceptance:** A second game type ships with its own `app/games/<game2>/` namespace. Adding a third game from there requires no further restructuring — just create the new directory + register it.
**Dependencies:** None — defer until game #2 is decided. Premature execution = wrong abstraction. Three soft triggers for opening this item:
- (a) Game #2 is concretely scoped, not just "maybe later".
- (b) The "Now" roadmap section is < 5 open items (so the refactor doesn't stall feature work).
- (c) 421 has been stable in production for ≥ 3 months — i.e. the patterns we're abstracting are battle-tested.

### G80. Native mobile apps — iOS + Android via React Native + Expo
**Why:** A web-only game leaves Apple/Android store discovery, push notifications, and the "permanent home screen icon" trust signal on the table. For a casual real-time dice game the "buddy pings you for a round" workflow is much smoother with native push notifications than with web push. App-store presence also confers legitimacy that helps onboarding (« is this a real app? » → app-store listing answers yes).

**Why React Native + Expo specifically:**
- **Stack continuity** — same React mental model + JS as the existing SPA. Custom hooks (`useGame`, `useAuth`, `useLang`, `useTheme`) can mostly transfer with minimal changes. i18n dictionaries port 1:1.
- **Single codebase for iOS + Android** — Flutter would also do this but requires learning Dart from scratch. Native Swift + Kotlin doubles the work for a solo dev.
- **Expo Application Services (EAS) handles deploy/sign/distribute** — Apple signing certificates, Android keystores, store-submission CLI. Without it, iOS deployment alone is ~2 weeks of Apple-specific yak-shaving.
- **WebSocket support is first-class** — `react-native` ships a `WebSocket` global identical to the browser's.
- **Sentry + Anthropic/Brevo SDKs all have RN packages** — the monitoring stack from [[G77]] carries over.

**Why NOT Capacitor (wrap the existing SPA):**
- Apple's "minimum functionality" guideline (4.2.3) rejects bare website wrappers. We'd need to add native features anyway — at which point we're already off the wrapper path.
- WebView performance on the piste animation + dice rendering would noticeably lag native.
- Push notifications via web are weaker than native (background reliability, action buttons).
- Listed for completeness but not the recommendation.

**Scope (phased):**

- **Phase A — minimum viable native app (~3-4 weeks of focused work):**
    * `mobile/` directory in the monorepo, scaffolded with `npx create-expo-app`.
    * Port the auth flow first (login, register, /auth/me) — uses the existing `/auth/*` endpoints unchanged. Authenticated screens reuse the JWT.
    * Port the lobby flow (list public rooms via existing `/api/rooms`, join via `/api/join/{game_id}`).
    * Game screen: re-implement the piste + dice + action bar in RN-native components (no WebView). Reuse the WS message protocol exactly — `useGame` hook ports with `import { WebSocket } from 'react-native'`.
    * Drop the heavier desktop features for v1 — admin dashboard, the full Privacy/Terms pages link out to the web URL.
    * Persistent storage via `@react-native-async-storage/async-storage` (mirrors web `localStorage`).

- **Phase B — push notifications + deep links (~1 week):**
    * Apple Push Notification service (APNs) + Firebase Cloud Messaging (FCM) registration. Expo's `expo-notifications` wraps both.
    * Backend: `POST /api/me/push-token` to register a device token; persist in a new `UserPushToken(user_id, token, platform, last_seen_at)` table.
    * Send notifications on:
        - Your turn in a game where you're AFK (already wired to G2/G50 events backend-side).
        - Game invite from a friend ([[G29]] dependency).
        - Moderation verdict ([[G33]] dependency).
    * Deep links: `421bistro://join?code=ABC123` opens the app on the room-join screen pre-filled.

- **Phase C — polish + store submission (~1 week per platform):**
    * App icons + splash screens (Expo handles the size matrix).
    * Privacy nutrition labels (Apple) + data safety form (Google Play) — both stores require declaring what data is collected. We're already RGPD-compliant so the answers are honest and short.
    * Apple Developer Program enrolment ($99/yr). Google Play one-time $25.
    * « Sign in with Apple » — Apple guideline 4.8 *requires* it if the app offers any third-party SSO (we offer Google). Implementation via `expo-auth-session` is straightforward.
    * EAS Build → EAS Submit pushes to TestFlight + Play Store internal testing.
    * Beta with a small group (10–20 testers via TestFlight + Play Internal Testing) for 1–2 weeks before public release.

**Backend changes needed (small):**
- `UserPushToken` table + migration.
- `POST /api/me/push-token` endpoint.
- Push-send service alongside the email service (`app/services/push.py`). Triggers from existing event-emission points in `app/game/ws.py`.
- « Sign in with Apple » OAuth route mirroring the existing `/auth/google` path.

**Cost estimate:**
- Apple Developer: **$99/yr** (mandatory)
- Google Play: **$25 one-time** (mandatory)
- EAS Build: free for hobby tier; **$19/mo** when you need parallel builds
- Push notification volume: free up to large scale on both APNs and FCM
- Total ongoing: **~$11/mo** equivalent ($99/yr Apple)

**Acceptance:** A user can:
- Download "421 Bistro" from the App Store / Google Play
- Sign in with their existing web account, or create a new one
- Join a public room and play a full match end-to-end
- Receive a push notification when it's their turn in a game they backgrounded
- The mobile app's RGPD privacy disclosures match the web app's Privacy page

**Dependencies:**
- [[G75]] (domain owned — for deep-link domains + share-link generation)
- [[G77]] (production deployment — beta users need a stable backend to point at)
- [[G29]] / [[G30]] (friend invites + external invite delivery) — they're more compelling on mobile where push delivery is native; the mobile entry could land first and these become higher-priority follow-ups.
- Optional but recommended: [[G79]] (multi-game refactor) before Phase A if a second game is on the horizon — the mobile codebase would inherit whatever shape the web codebase has.

**Skip-for-now alternatives if Phase A feels too big right now:**
- **PWA polish** — make the web app installable via "Add to Home Screen" (manifest.json, service worker, web-push). Zero new stack, gets ~70% of the UX benefit. Captured separately as G80b if you want me to spin it out.
- **TestFlight-only release** (no Play Store) — Apple side first, Android later. Halves the store-submission work but limits beta audience to iPhone users.

### G61. Right-rail panels become collapsible "tabs"
**Why:** Reported during playtest. The right `<aside>` today is a fixed layout: collapsible **Journal** on top, *always-visible* **Combo hierarchy** at the bottom. The user wants the hierarchy to collapse the same way the journal does — and more broadly, they want the right rail to behave like a small set of *stackable tabs* (Journal · Hierarchy · later: Chat) that each open/close independently. This sets up the eventual chat slot ([[G59]]) without ripping out the existing panels.
**Scope:**
- **Component:** new `CollapsiblePanel.jsx` in `frontend/src/components/shared/` taking `{ title, subtitle?, defaultOpen, children, onToggle }`. Renders a sticky header with the panel title + collapse button (▲ / ▼), then the children when open. Mirrors the existing journal header treatment so the visual language stays consistent.
- **Refactor `Game.jsx`'s right `<aside>`:**
  - Wrap the journal content in a `<CollapsiblePanel title={t('log')} subtitle={t('log_subtitle')} defaultOpen>`. Lift the existing `logOpen` state in or move it into the new component (lift up if other components need to know).
  - Wrap the hierarchy in a second `<CollapsiblePanel title={t('combo_hier')} defaultOpen={false}>`. Default-closed so it doesn't compete with the journal for vertical space.
  - When [[G59]] / chat ships, add a third `<CollapsiblePanel title={t('chat')} />` panel in the same rail.
- **Vertical layout:** the rail uses `display: flex; flex-direction: column`. Each panel collapses to just its header when closed; the open panel claims the remaining `flex: 1` so users can read it comfortably. Two open panels share the space proportionally.
- **State persistence:** localStorage `panel_state: { log: bool, hierarchy: bool, chat: bool }` so a user's open/closed choices stick across refreshes / G60 rehydration.
- **A11y:** each header acts as a button with `aria-expanded` reflecting state; `aria-controls` pointing to the body region; keyboard Enter / Space toggles.
- **Tests:** none required for this MVP (pure UI state). Manual playtest validates the visual flow.
**Acceptance:** The hierarchy section now has its own collapse button identical to the journal's. Closing both panels collapses the rail to just two headers + a thin spacer. Reopening either expands smoothly. The toggle states persist across page reloads.
**Dependencies:** Pairs cleanly with [[G59]] (chat-prep) and [[G60]] (session persistence — the panel_state localStorage key is part of the same persistence layer).

### G62. (DONE) Game-room layout overflow / overlap fix at 100% browser zoom
**Why:** Reported during playtest. The user was running at 80 % browser zoom, which masked layout issues. At 100 % zoom the room breaks: the piste is too large for the viewport, text feels oversized, the bottom action bar gets pushed off-screen and forces a page scroll, and the top bar elements overlap (the last-throw dice on a `PlayerStrip` collide with the player's name pill). The host's « ⚙ Room rules » pill in the top-right adds a chunk of width that compounds the overlap.
**Scope:** Viewport-fit piste via CSS grid `auto 1fr auto` rows in the middle column + container queries on the piste-stage. Action bar 3-column grid (info · secondary · primary) so play buttons stay flush right when wrapping. Per-strip dice hidden ≤ 1280 px. Host « ⚙ Room rules » button icon-only at all widths. Top-bar moved from PlayerStrips to a vertical PlayerRail in the left aside (was squishing badly at 3+ players). Pool stack `1.45×` scaled in the centre. Bandage/skull pip system with always-on counters in the rail card. « ❦ LA PISTE ❦ » decorative label removed (overlapped G47 top seat).
**Acceptance:** At 100 % zoom on any laptop-or-larger viewport, the game room fits without a page scroll. Top-bar elements never overlap. The host's room-rules button doesn't push other controls off-screen. The action bar (Lancer / Valider / Quitter) is always visible at the bottom without the user having to scroll.
**Dependencies:** Bundled with [[G14]] and [[G52]] in spirit. Shipped via the same PR as [[G64]] and [[G47]] rotation.

### G63. (DONE) Cross-page responsive UX audit + breakpoint discipline
**Why:** The user wanted assurance that *every* page (home, lobby, waiting room, game room, profile, rankings, login/register, reset, contact, how-to-play, terms, privacy) renders cleanly across **mobile (375 px) / tablet (768 px) / laptop (1280 px) / desktop (1920 px)**. [[G19]] hit the TopBar's 641–835 px band, [[G62]] fixed the game room, but no end-to-end pass had run.
**Scope:** Code-level audit of every page in `frontend/src/pages/` plus shared layout components. Documented findings in `docs/RESPONSIVE_AUDIT.md` (4-breakpoint contract; per-page punch list). Top 10 follow-up fixes prioritised; each becomes its own roadmap entry (G68+) when picked up.
**Acceptance:** Audit doc committed. Future fix work has a clear punch list.
**Dependencies:** None. Investigation work; shipped via PR #40 (chore/g63-responsive-audit).

### G64. (DONE) Mobile / tablet gameplay layout — rewrite from scratch
**Why:** Reported during playtest. The desktop layout (3-column grid + top-bar PlayerStrip row + bottom action bar) was unusable on < 1024 px viewports. Existing breakpoints only stripped components down — the underlying structure still tried to assert itself.
**Scope shipped:**
- `useMediaQuery('(max-width: 959px)')` switches `Game.jsx` to render `<GameMobile />` below 960 px. Desktop branch untouched.
- New `GameMobile.jsx` shell: slim top header (phase · round · turn · top-right 🚪 Quit), full-bleed piste, 2-row bottom dock (Roll/Validate primary; Journal/Live/Hierarchy/Settings secondary).
- New `BottomSheet.jsx` drawer component — slide-up panel, backdrop, drag-handle, `prefers-reduced-motion` aware. Journal + Live live in drawers; Hierarchy reuses the existing lightbox.
- `MobilePisteSeat` trimmed variant with G47 rotation reused (viewer at the bottom).
- Manche/partie pip system (🩹/💀) with always-on counters per player card.
**Acceptance:** A player can play a complete match on a 375 px phone using only thumb gestures. Mobile/tablet/laptop verified across the matrix.
**Dependencies:** Built on [[G47]] (viewer at bottom) + [[G62]] (piste sizing) + [[G60]] (drawer state). Shipped together via PR #46.

### G65. (DONE) Dice scale responsive to viewport
**Why:** Dice were CSS-fixed at 4.5 rem regardless of viewport. On phones that's a third of screen width per die; the cluster overflowed the piste's bottom slot. On 960–1180 px laptop band the corners clipped against the curved piste boundary.
**Scope shipped:**
- `--die-size` CSS custom property scoped to `.gameroom-piste-stage` via container queries: `clamp(2.4rem, 12cqi, 4.2rem)`. Dice now scale relative to the piste container, not the viewport.
- `--die-pip-size: clamp(0.38rem, 1.85cqi, 0.65rem)` follows proportionally.
- Mini dice (`.die-mini`) unchanged.
**Acceptance:** Dice fit comfortably in the piste at every viewport width.
**Dependencies:** None. Shipped alongside [[G64]] via PR #46.

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

## Admin & moderation foundation

This block ships in coordination with the chat-moderation suite (G32–G37 in the moderation-suite PR). It's the human-facing side: the dashboard the moderator uses, the inbox where AI-escalated reports land, the 3-strike accounting engine that decides who gets warned vs. muted vs. banned, the login-time ban gate, and the per-room ban upholding flow.

### G38. (partially DONE — pending PR merge) Admin / moderator role + dashboard surface
**Why:** TheWitch (`ripochesierra@gmail.com`) is the seed admin. The interface they see needs to be different from a regular player: a top-level "Admin dashboard" entry, a moderation inbox count badge, and the ability to delegate moderator role to others. Without a code-side role enum, none of the moderation tooling has anywhere to authorize against.
**Scope:**
- **Schema** — `User.role: enum(player | moderator | admin)` (stored as `String(16)`, default `"player"`). `User.chat_banned_until`, `User.banned_until`, `User.ban_reason`, `User.strike_count` columns. Alembic migration includes a data step that promotes the seed admin by email.
- **Auth** — new `require_moderator` and `require_admin` FastAPI deps (`app/core/security.py`). `/auth/me` surfaces `role`, `strike_count`, `chat_banned_until`, `banned_until`, `ban_reason`. Frontend `useAuth` propagates the role.
- **Admin router** (`app/routers/admin.py`) — `GET /api/admin/dashboard-summary` returns counts (pending_reports, active_bans, total_users, active_strikes). Moderator-gated. More endpoints land with G39 / G40 / G42.
- **Admin dashboard page** (`frontend/src/pages/AdminDashboard.jsx`) — top-level route `/admin`, three placeholder panels (Inbox / Users / Room bans) that G39 / G40 / G42 fill in. Non-admins hitting `/admin` get redirected to `/profile`.
- **Profile updates** — admin/moderator badge next to username + "Admin dashboard" link.
- **Promote/demote moderators** — admin-only `PATCH /api/admin/users/{user_id}/role`. Audit row in `GdprAuditLog`.
**Acceptance:** TheWitch logs in → sees the admin badge on her profile + an "Admin dashboard" link → /admin renders the 3-panel layout with live counts pulled from the summary endpoint. A regular player navigating to /admin is redirected to /profile.
**Dependencies:** None — this is the foundation everything else hangs off of.

### G39. Moderation inbox (HITL queue)
**Why:** When the AI triage (G37) returns `human_review`, when a category requires legal review (csam_suspect, named-victim doxxing), or when a user appeals an AI verdict — these all need to land somewhere the moderator actually sees. The inbox is the single pane of glass that prevents items from getting lost.
**Scope:**
- **Inbox model** — `ModerationInboxItem(id, kind, reference_id, severity, status, assigned_to, created_at, resolved_at, resolved_by, notes)` where `kind ∈ {report_human_review, report_appeal, ban_appeal, csam_legal_review, system_alert}` and `reference_id` foreign-keys into `ModerationReport` (G37) / `RoomBan` (G32) / etc.
- **Inbox endpoints** —
  - `GET /api/admin/inbox?status=open&kind=...&sort=newest` paginated list
  - `GET /api/admin/inbox/{id}` full detail with the surrounding context (message + 5 surrounding messages for reports, recent room activity for bans)
  - `POST /api/admin/inbox/{id}/resolve` body `{verdict, action_taken, notes}` → applies the verdict (e.g. `chat_ban_temp_30d`, `dismiss`, `escalate_to_admin`) and closes the item
  - `POST /api/admin/inbox/{id}/reassign` admin-only; reassigns to another moderator
- **Inbox UI** — top of admin dashboard. Per-item card shows: kind, reported user, AI's prior verdict + confidence, full message + context, action buttons (apply verdict / dismiss / escalate / reassign).
- **Counts + notifications** — badge in TopBar with inbox count for logged-in moderators; daily Resend digest email of items pending > 24h (configurable threshold).
- **Bulk actions** — select multiple items → bulk dismiss / bulk escalate. Useful for brigade-reporting cleanup.
**Acceptance:** AI triage escalates a report → item appears in inbox within seconds → moderator opens it, sees the full message + context, applies "chat_ban_temp_30d" → user gets notified (G27 / G42 login gate), inbox count drops by 1.
**Dependencies:** G38 (auth + dashboard surface), G37 (escalation source), G27 (notification sink).

### G40. 3-strike enforcement engine (warn → mute → ban)
**Why:** The rule we've agreed on: most rule-breaks earn strikes; outright legal violations (threats, hate speech, sexual content involving minors, doxxing of named individuals) skip strikes and go straight to a permanent ban. The engine is the central accounting layer that every other moderation surface defers to — so "what counts as a strike", "how strikes decay", and "what each strike level does" are defined once.
**Scope:**
- **Rule table** (`app/services/enforcement.py`) — one source of truth:
  | Category | Auto-action | Counts as strike? |
  |---|---|---|
  | hate_speech (confirmed) | perm chat ban + account ban review | NO — direct ban |
  | csam_suspect (confirmed) | perm account ban + legal escalation | NO — direct ban |
  | doxxing (named victim) | perm chat ban + 30d account suspension | NO — direct ban |
  | credible_threat | perm chat ban + 7d account suspension | NO — direct ban |
  | harassment | 1st: warn · 2nd: 24h chat mute · 3rd: 30d chat ban | YES |
  | sexual (not minor) | 1st: warn · 2nd: 24h chat mute · 3rd: 30d chat ban | YES |
  | spam | 1st: warn · 2nd: 1h chat mute · 3rd: 7d chat mute | YES |
  | rule_break_minor | 1st: warn · 2nd: warn · 3rd: 7d chat mute | YES |
  | cheating | 1st: warn · 2nd: 7d account suspension · 3rd: perm account ban | YES |
- **Strike decay** — strikes older than 90d are excluded from the active count. The raw count never decrements (audit-preserving) but only the rolling-90d window decides next action.
- **Engine API** — `record_strike(user_id, category, source) -> EnforcementAction` returns the action that was just applied (so callers know what to communicate). Persists a `StrikeRecord(id, user_id, category, source, action_taken, occurred_at)` row.
- **Login gate (G42 plumbing)** — the engine writes `User.banned_until` / `User.ban_reason` directly so the login flow only has to check one column.
- **Notification fan-out** — every strike + action triggers a notification (G27) to the affected user with category, action, duration, and the appeal link.
- **Moderator override** — `POST /api/admin/users/{user_id}/clear-strikes` (admin only, audited). For false-positive recovery.
**Acceptance:** Calling `record_strike(user_id, "harassment", source="ai_triage")` three times in a row produces 3 distinct StrikeRecord rows AND escalates the user from warn → 24h mute → 30d chat ban, with notifications fired at each step. Calling `record_strike(user_id, "csam_suspect")` once triggers immediate account ban + legal escalation.
**Dependencies:** G38 (role + ban columns), G27 (notifications), G39 (inbox surfaces the override action).

### G41. Per-room ban upholding (host + moderator joint authority)
**Why:** When a room host bans a player from THEIR room (G32), that ban belongs to the host — not the platform. So: the host owns it (can lift it later from their own dashboard), but the platform moderator can also see and uphold it. If the host later un-bans someone the moderator considers genuinely dangerous, the moderator can override and lock the ban platform-wide.
**Scope:**
- **`RoomBan.upheld_by` column** (default null). Null = host-only ban; populated with a moderator's user_id = platform-upheld (host can no longer lift it).
- **Host dashboard view** — new `frontend/src/pages/MyRoomBans.jsx` (linked from Profile): lists all RoomBans where `banned_by_user_id == me`. Each row shows banned user + reason + date + "Lift this ban" button (disabled with explanation if `upheld_by` is set).
- **Moderator inbox surface** — Room bans appear in the G39 inbox under `kind=room_ban_review` when they reach a threshold (3 bans of the same user across distinct rooms in 30d → auto-create an inbox item for moderator review).
- **Moderator action** — from inbox, can `POST /api/admin/room-bans/{id}/uphold` (locks the ban from host lifting) OR `escalate-to-account-ban` (chains into G40's engine).
- **Lift-ban path** — `DELETE /api/rooms/bans/{id}` (host only if `upheld_by IS NULL`). Records to GdprAuditLog.
**Acceptance:** Host bans a player → 3 weeks later wants to give them another chance → goes to MyRoomBans → clicks "Lift this ban" → user can re-join. If a moderator had upheld it in the meantime, the Lift button is disabled with copy explaining why and how to appeal.
**Dependencies:** G32 (RoomBan table), G38 (moderator role), G39 (inbox).

### G43. Chat access tiers — registered-only send, guest-only react
**Why:** Anonymous free-text chat is the moderation-impossible mode. Forcing message-send to a registered account makes every offence directly attributable to a user_id, which makes G35 IP capture, G37 peer reports, G40 strikes, and G42 login gate all meaningfully enforceable. Guests still feel social via a small reaction set without opening the abuse vector. This is a deliberately family-friendly default — not a friction-for-friction's-sake choice.

**Scope:**

A. **Three access tiers**
- **Tier 0 — banned-from-chat user** (`User.chat_banned_until > now()`): can read messages, cannot send, cannot react. UI shows their muted state with the time remaining + reason.
- **Tier 1 — guest / unregistered** (no JWT on WS handshake): can read messages, can fire from a fixed reaction palette (👏 🍷 🎲 🔥 😂 ❦ — 6 buttons, no custom emoji), cannot send free-text.
- **Tier 2 — registered user** (`User.chat_banned_until` null or expired): full send + react. Rate-limits per G36.

B. **WS enforcement**
- `chat_send` action requires authenticated user. Guest socket sending `chat_send` gets `{type: "chat_blocked", reason: "guest_send_disabled", hint: "Register or log in to chat."}`.
- New `chat_react` action accepts `{emoji}` where `emoji` must match one of the 6 preset codepoints (server-side whitelist). Anything else → `{type: "chat_blocked", reason: "invalid_reaction"}`.
- Reactions broadcast as `{type: "reaction", from_display, emoji, message_id_target}`; they overlay the targeted message (or attach to the room if no target).
- Rate limit (G36 extension): guest react bucket is tighter — capacity 3 reactions / 10 s, refill 1 / 4 s. Same global anti-spam cap as registered users.

C. **Frontend**
- Chat input shows different UI per tier:
  - Tier 0: input replaced with a calm rouge banner « Vous êtes en pause de chat jusqu'au {date}. » + a /contact appeal link.
  - Tier 1: input replaced with the 6-emoji palette row + a brass-bordered « Inscrivez-vous pour écrire » CTA linking to `/login?tab=register`.
  - Tier 2: normal text input.
- Reaction palette is keyboard-navigable (arrow keys + Enter).
- Reaction overlays auto-fade after 4 s; multiple identical reactions in 2 s stack into a `×N` chip rather than spawning separate floats.

D. **Why guests aren't completely locked out**
- The bistrot atmosphere wants a low-friction "drop in, watch a hand" feel — kicking guests out of chat entirely kills that. Reactions are the compromise: enough social presence to feel like a room, not enough abuse surface to need full moderation.
- Guests still have their IP captured at WS handshake (G35). A guest who spams reactions to evasion levels gets the same IP-ban treatment as a registered user — they just hit the limit faster because their bucket is tighter.

E. **Edge cases**
- A guest gets a reaction-IP-ban → all sockets from that IP get `{type: "chat_blocked", reason: "banned_ip"}` for reactions AND view (we don't want the IP loitering on chat). Game still plays — the ban is chat-only.
- A registered user gets `chat_banned_until` mid-game → next `chat_send` returns the banned response; reactions continue to work because reactions are a Tier 1 affordance and chat-ban is specifically about text. (Alternative: treat reactions as Tier 2 too — TBD when we ship.)
- Logged-out-mid-session: WS handshake re-evaluates tier on reconnect. If the user logs out, they're back to Tier 1 until they log back in.

**Acceptance:**
- Guest opens a game → sees other players' messages → sees the emoji palette → can fire reactions → cannot type free text. Registration CTA visible.
- Registered user → full chat. Strike + ban → tier drops to 0 with the banner.
- Spamming guest hits IP-ban → reactions stop landing, view also drops.

**Dependencies:** Item 8 (chat), G34 (moderation), G35 (IP), G36 (rate-limiter), G42 (ban-state messaging copy).

### G42. Login-time ban gate (clear messaging + cool-down reminder)
**Why:** A banned user trying to log in should get a clear, kind explanation — not a generic "invalid credentials." Temp-banned users should see when they can come back + a reminder of the rules. Permanently banned users should see the reason category + an appeal link. The mistake to avoid: silently letting them in with chat broken or letting their account vanish without explanation.
**Scope:**
- **Login flow change** — `POST /auth/login` checks `User.banned_until` and `User.ban_reason` after password verification.
  - `banned_until IS NULL` → normal login.
  - `banned_until > now()` → return **403** with `{error: "account_temporarily_suspended", reason: <category>, until: <iso>, rules_link: "/terms"}`. Frontend renders a friendly screen.
  - `banned_until IN past` AND status='permanent' (separate flag) → return **403** with `{error: "account_permanently_banned", reason: <category>, appeal_link: "/contact?subject=appeal"}`. Frontend renders an explainer.
- **Chat-only ban** — `chat_banned_until` does NOT block login (the user can still play games). Surfaced via `/auth/me`; chat WS just drops their messages with a polite refusal.
- **Frontend screens**:
  - `LoginBlockedTemp.jsx` — "Votre compte est suspendu jusqu'au {date}. Voici un rappel des règles…" + the rule excerpt that was violated + countdown + auto-redirect to `/login` when expiry passes.
  - `LoginBlockedPerm.jsx` — "Votre compte a été désactivé pour {reason}. Voici la décision et les voies d'appel." + Contact link with the case prefilled.
- **Logout-on-mid-session-ban** — if a moderator bans an active user, the next WS message gets `{type: "session_terminated", reason: ...}` and the frontend redirects to the appropriate blocked screen.
- **i18n** — French + English copy for all messaging. Tone stays respectful even for permanent bans (legal-safer + reduces escalation).
**Acceptance:** A user banned for 7 days tries to log in → sees the temp-block screen with the date and rule excerpt → 7 days later logs in successfully. A user permanently banned for csam_suspect → sees the perm-block screen with the appeal link → can't log in until appeal verdict.
**Dependencies:** G38 (ban columns), G40 (engine writes the columns), G27 (in-session ban notification).

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

- **2026-05-24** _(pending PR merge — `feature/g2-bot-handback`)_ — **G2 bot-handback grace window.** After the AFK bot plays a turn, the cycle advance is now deferred by `BOT_HANDBACK_GRACE_SECONDS` (= 3 s). If the human reconnects to the WS OR sends a play action (`roll`/`keep`/`done`/`tiebreak_roll`/`initial_roll`) inside that window, the deferred task is cancelled, `player.turn` is restored from a deep-copy snapshot taken just before the bot mutated it, the cycle's rhythm is rolled back if the bot had locked it as starter, and the bot's AFK-takeover + bot-turn log entries are spliced out. The human gets a fresh `log_bot_handback` line on the table feed and resumes their own turn. Without a reconnect/action in the window, `_finalize_bot_turn` commits the bot's turn normally (advance → resolve_round if all_done → broadcast → reschedule AFK). New `Game.bot_handback_tasks` + `Game.bot_handback_snapshots` dicts. `_cancel_afk` extended to also drop pending handbacks (no restore) so leave / kick / disconnect cleanup is safe. 6 new unit tests cover: noop on missing handback, turn-snapshot restoration, deferred task cancellation, log rollback, max_throws_this_round restoration, and `_cancel_afk` cleanup path. New `log_bot_handback` i18n key (FR + EN). Gates: 256 passed, coverage 84.00%, ruff + format clean, frontend lint + build clean.
- **2026-05-24** _(pending PR merge — `feature/g9-smarter-afk-bot`)_ — **G9 smarter AFK bot.** Replaces the single-random-roll bot with a couple-of-rules heuristic that reads the table and plays to win. New pure `_bot_pick_keepers(dice)` in `ws.py` returns a [bool, bool, bool] reroll mask using six priority-ordered rules: (1) 2+ aces → keep all 1s (chase 111 / 11x), (2) 4 AND 2 present → keep 4 + 2 + any 1 (chase 421), (3) any pair → keep pair + any lone ace, (4) lone ace → keep ace + highest other, (5) two consecutive values → keep them (chase suite), (6) default → keep highest. `_bot_take_turn` now takes optional `Game` arg: with game context it computes `target_rank` from the players who've already played this cycle, iterates throws within the rhythm cap (`max_throws_this_round` for non-starters; 1 under sec/CHARGE for everyone), and stops on first roll that strictly beats the target — or when out of throws / already on 421. Without game context (existing unit tests), falls back to the legacy single-roll behavior. `_afk_timer` now passes `game` to the bot AND locks the rhythm if the bot was the starter (mirrors the human `done` handler) — fixes a pre-existing gap where bot-as-starter never set `max_throws_this_round` for the rest of the cycle. 14 new unit tests cover each heuristic branch + game-aware behavior + sec/CHARGE single-throw cap + max_throws cap on non-starters. Gates: 250 passed, coverage 83.82%, ruff + format clean, frontend lint + build clean.
- **2026-05-23** _(pending PR merge — `feature/playtest-polish-g1-g3-g4-g5-g6`)_ — **Playtest polish bundle: G1, G3 (verified-existing), G4, G5, G6**. Five reported gameplay quality fixes in one PR. **G1** AFK timer: backend stamps `Game.afk_started_at` (epoch ms) whenever `_schedule_afk` (re-)starts the per-turn timer in CHARGE/DECHARGE/TIEBREAK; AfkBar now derives remaining from `state.afk_started_at` instead of mounting a stale local countdown — clicking dice visibly resets the bar. **G3** verified: auto-validate on final roll was already inline in `ws.py` (line 540+, comment tagged `# Auto-validate (G3)`); roadmap updated. **G4** `RollDots` hidden when `max_throws === 1` unless the starter hasn't acted yet (no more "0/1" noise). **G5** Die.jsx gets corner ✓/↺ badges on interactive dice (brass when kept, rouge when set to re-roll); new `KeepLegend` component sits above the dice cluster with chip-labeled "gardé / à relancer" so the encoding reads at a glance. **G6** `formatLogEntries` swaps to second-person `you_*` variants when the viewer is the event's subject — covers turn / charge_takes / decharge_gives (winner + loser perspectives) / match_lost / round_point / sits_out / afk_takeover / afk_turn / round_start / new_set. 11 new i18n keys × 2 locales. 5 new unit tests on `_schedule_afk` stamping behavior across phases (CHARGE/DECHARGE stamp, INITIAL_ROLL doesn't, FINISHED clears, bot-disabled clears). Gates: 236 passed, coverage 84.15%, ruff + format clean, frontend lint + build clean.
- **2026-05-23** _(pending PR merge — `feature/g18-round-point-persistence`)_ — **G18 leave/kick path**. New `persist_player_session(user_id, game_code, round_points)` in `app/services/game_persistence.py` bumps `PlayerStats.games_played` and attributes the leaver's `round_points` to `losses` (or counts a `win` if they left with 0). Wired into the WS leave **and** kick handlers as a background task, snapshotting values before the cleanup mutates them. ELO recalc deliberately deferred — we don't have a canonical game-end to define "opponents" for the rating sense. 6 new integration tests cover normal / zero / accumulate / unknown-user / invalid-uuid / empty-id paths. Coverage 83.62%. Still queued: `GameRecord` / `GamePlayer` history-row writes on room dissolve (Recent Games panel stays empty until then) + ELO trigger.
- **2026-05-23** `0f1676d` (PR #19) — **G38 first cut**. Adds `User.role` (`player | moderator | admin`, default `player`), `User.strike_count`, `User.chat_banned_until`, `User.banned_until`, `User.ban_reason`. Alembic migration `g38admin0001` (chained off the current head `a1b2c3d4e5f6`) adds the columns AND promotes the seed admin (`ripochesierra@gmail.com`) to `admin` via an idempotent UPDATE. New `require_moderator` / `require_admin` deps in `app/core/security.py`. New `app/routers/admin.py` with `GET /api/admin/dashboard-summary` (moderator-gated counts) + `PATCH /api/admin/users/{user_id}/role` (admin-only, audited via GdprAuditLog). `/auth/me` now returns role + strike + ban fields. `POST /auth/login` rejects accounts with `banned_until > now()` with 403 + structured payload (`{error, reason, until}`) the frontend uses to render a blocked-login screen. Frontend: new `/admin` route with `AdminDashboard.jsx` (live summary grid + 3 placeholder panels for G39 inbox / G40 strikes / G41 room bans, non-admins redirected to /profile); admin/moderator badge + dashboard link injected into `Profile.jsx`. 9 new integration tests cover default-role default values, player→403 on admin route, moderator→200, admin role promotion, moderator-cannot-promote, unknown-role rejection, login ban gate (active + expired), chat_banned_until doesn't gate login. 22 new i18n keys (FR + EN). Gates: 225 passed, coverage 84.42%, ruff + format clean, frontend lint + build clean. **Still queued:** G39 inbox, G40 strike engine, G41 room-ban uphold UI, G42 login-blocked screens.
- **2026-05-23** `302cefa` (PR #17) — **G14 + G21 first cut**. Three-column game-room grid (`260px | 1fr | 320px`) with a new left-rail `CommentaryTicker` (rolling stack of up to 5 headline events: manche/round-point/tiebreak/player-left/kick/afk-takeover/pool-empty/all-tie/sit-out; colored eyebrow per category, slide-in animation, naturally cycles as new headlines arrive). The piste itself grows to `min(820px, 85vh)` and gets a clearer visual hierarchy: « La piste » label up top, new `ScoreToBeatBanner` pinned at top-of-piste (reads `current_round_plays`, surfaces the highest-rank play as "Score à battre : {name} · {combo} ({fiches}f) · N lancers"), pool chips dead-center as the focal point with a small label, dice cluster + combo + keep-hint anchored at the bottom. Mid-width breakpoint (1180px) hides only the ticker so the piste stays roomy on laptops; full mobile stack below 980px. New i18n: ticker_eyebrow/title/empty/aria, 7 ticker_label_* badges, score_to_beat_label/in_throws/aria (FR + EN). Bundle size +5 KB.
- **2026-05-23** _(pending PR merge — `feature/g18-round-point-persistence`)_ — **G18 leave/kick path**. New `persist_player_session(user_id, game_code, round_points)` in `app/services/game_persistence.py` bumps `PlayerStats.games_played` and attributes the leaver's `round_points` to `losses` (or counts a `win` if they left with 0). Wired into the WS leave **and** kick handlers as a background task, snapshotting values before the cleanup mutates them. ELO recalc deliberately deferred — we don't have a canonical game-end to define "opponents" for the rating sense. 6 new integration tests cover normal / zero / accumulate / unknown-user / invalid-uuid / empty-id paths. Coverage 83.62%. Still queued: `GameRecord` / `GamePlayer` history-row writes on room dissolve (Recent Games panel stays empty until then) + ELO trigger.
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
