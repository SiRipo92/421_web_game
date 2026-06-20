# Production smoke tests

Some features can only be properly verified once the app is deployed and
reachable over real DNS + HTTPS + multi-client WebSockets. The dev
environment (single browser, localhost-only, optional Sentry/Brevo
mocks) doesn't cover every code path.

This file is the durable checklist of « run this against production
after G77 deploys, before announcing launch ». Each section is keyed
to its roadmap item so it's clear what shipped without a full smoke
test and is owed verification later.

When a section is fully run and green, move it to the **Verified** log
at the bottom with a timestamp + commit SHA of whatever was running in
prod at the time. Failed runs go into Verified too with the failure
mode so we don't re-run blind.

---

## G95 — Room moderation

**Why this needs prod:** the broadcast / kick / dissolve flows involve
multi-client WebSocket fanout. Local dev with one browser can't observe
what player B sees when admin acts on player A.

**Prerequisites:**
- App deployed and reachable over `https://421bistro.com`
- Your admin account (`ripochesierra@gmail.com`) recognized as admin
- A second device OR a second incognito session with a different test
  account

### Setup
1. From device A (host), create a public room. Note the game code.
2. From device B (or incognito tab as a different test account), join
   the room as a second player. Confirm both seats are filled and the
   game is in PLAYING phase.
3. From device A's main browser (different tab, logged in as
   admin), open `/admin/rooms`.

### Test 1 — Room list + detail render correctly
- [ ] `/admin/rooms` lists the new room with 2 players + correct host
      name
- [ ] Phase badge shows the right phase (CHARGE / DECHARGE / etc.)
- [ ] Public/private indicator matches what you set
- [ ] Clicking the row opens `/admin/rooms/<code>` with the full roster
      visible

### Test 2 — Broadcast banner reaches all sockets
- [ ] In `/admin/rooms/<code>`, click **« Envoyer une annonce »**
- [ ] Write a French + English message, pick **severity = warning**
- [ ] Click send → modal closes
- [ ] **Device A** game tab shows brass-colored banner at top with the
      French message (since the player's lang is FR by default)
- [ ] **Device B** game tab shows the same banner
- [ ] Banner has a dismiss button (×) on the right; clicking it removes
      it from THAT client only (others still see it)
- [ ] Repeat with severity = info (brass-light) and severity = critical
      (rouge) — colors should match

### Test 3 — Admin kick (stronger than host-kick)
- [ ] In room detail, click **« Expulser »** next to player B
- [ ] Modal: enter reason « test », pick chat-ban = 1h, confirm
- [ ] **Device B** game tab shows the « kicked » overlay with reason
- [ ] Device B is removed from the player roster on Device A
- [ ] Device B navigates back to lobby and tries to join any room with
      chat → confirm chat is blocked (chat_banned_until is set)
- [ ] Open `/admin/users/<device-B-user-id>` → confirm
      `chat_banned_until` is set ~1 hour in the future
- [ ] Open `/admin/audit?event_type=admin_room_kick` → confirm the row
      is there with reason + target_name + chat_ban_until in metadata

### Test 4 — Admin can kick the host (host migrates)
- [ ] Recreate the room with both devices
- [ ] In admin room detail, click « Expulser » on **the host** (the
      player with the HÔTE badge)
- [ ] Device A (the host) shows kicked overlay
- [ ] The remaining player (Device B) is now the host — confirm by
      reopening the room detail in admin (HÔTE badge moved)

### Test 5 — Dissolve room
- [ ] Recreate the room with both devices in mid-partie (a few cycles
      in so there are real round_points / manche counters)
- [ ] In admin room detail, click **« Dissoudre le salon »**
- [ ] Modal: enter reason « test reason for dissolution », type the
      exact game code in the confirm field, click Dissoudre
- [ ] **Both devices** show the full-screen "Salon dissous" overlay
      with the reason
- [ ] Click « Retour à l'accueil » on each device → lands home
- [ ] Refresh `/admin/rooms` on admin → the room is gone from the list
- [ ] Check `/profile` for the registered test account → confirm
      `parties_played` went up by 1 and `parties_lost` went up by 1
      (mid-partie persistence fired during dissolution)
- [ ] Open `/admin/audit?event_type=admin_room_dissolve` → confirm
      row with reason + player_count in metadata

### Test 6 — Spectate live
- [ ] Recreate the room. Admin clicks **« Regarder en direct »** in
      room detail
- [ ] New tab opens at `/game/<code>?role=spectator`
- [ ] **Note:** spectator mode itself (G87) hasn't shipped yet, so
      this link may currently fail or land you on a regular game view.
      Capture the actual behavior in the Verified log so we know whether
      G87 is genuinely required or if the existing `/game/:id` accepts
      spectators with relaxed handling.

---

## G93 — Bot-takeover hard timeout

**Why this needs prod:** the eviction flow requires a 10-minute AFK
window where the bot keeps playing. Brevo email delivery needs to hit
real mailboxes, not the dev mock. Anti-grief chat-ban semantics need a
real DB session, not the in-memory test setup.

**Prerequisites:**
- App deployed and reachable over `https://421bistro.com`
- Brevo domain verified + DKIM/SPF/DMARC live
- A test account with `email_opt_in=True` so the eviction email actually delivers
- For the speed run: set `BOT_TAKEOVER_MAX_MINUTES=5` in Fly.io secrets to halve the wait
  (you can revert it after, or leave it at 5 if 10 feels too long in real play)

### Test 1 — Bot eviction triggers after the timeout
- [ ] Sign in as your test account from Device A
- [ ] Create a public room, invite a second tab/account so the game can start
- [ ] On Device A, when it's your turn, walk away (don't act). Bot takes over after `afk_seconds` (45s default)
- [ ] Wait for the full `BOT_TAKEOVER_MAX_MINUTES` window. Bot should play your turns up to that point
- [ ] At T-`BOT_TAKEOVER_WARNING_SECONDS` (default 2 min before eviction), Device A receives the orange-bordered toast: « Vous serez retiré(e) de la partie dans X minute(s) si vous restez inactif(ve) »
- [ ] At T+0, Device A shows the full-screen eviction overlay with the elapsed minutes count
- [ ] Other players see the roster shrink — Device A's slot is gone
- [ ] Click « Retour à l'accueil » on Device A → lands home

### Test 2 — Eviction email lands
- [ ] After Test 1, check the test account's gmail inbox (or `421bistro.contact@gmail.com` if you used a `+suffix` alias)
- [ ] Confirm an email arrived from `421 Bistro <noreply@421bistro.com>` with subject « Votre partie 421 Bistro s'est terminée pour inactivité »
- [ ] Body shows the elapsed minutes + the room code + the « Reprendre une partie » CTA pointing at `/lobby`

### Test 3 — Stats persisted on eviction
- [ ] After Test 1, open Device A's `/profile`
- [ ] Confirm `parties_played` went up by 1 and `parties_lost` went up by 1
- [ ] Confirm ELO dropped slightly (-15 to -25 range; same as voluntary leave penalty)
- [ ] Open `/admin/audit?event_type=afk_eviction` (as admin) → confirm the row exists with `elapsed_minutes` in metadata + the game_id

### Test 4 — Bot-handback clears the eviction clock
- [ ] Re-enter a game with the same test account
- [ ] Go AFK for ~3 minutes → bot takes over → at some point COME BACK and act (any play action)
- [ ] Confirm in the journal: `log_bot_handback` / `log_afk_return` event fired
- [ ] Confirm Device A's `state.evictionWarning` is cleared (no toast lingering)
- [ ] Go AFK AGAIN — the timeout should re-start from zero, not pick up where the previous episode left off

### Test 5 — Anti-grief: 3rd eviction in 24h triggers chat-ban
- [ ] As your test account, get evicted twice in a row (rapid: leave a game, get into another, repeat)
- [ ] On the 3rd eviction, confirm:
    * The eviction proceeds normally
    * In `/admin/users/<test-account-id>`, `chat_banned_until` is now set ~24h in the future with reason `repeated_afk`
    * The eviction email body warns about chat-blocking risk for repeated AFK
    * Trying to chat in any room → blocked client-side (chat ban gate from existing G38 surfaces)

### Test 6 — Timeout clamping (sanity check, no production traffic needed)
- [ ] Set `BOT_TAKEOVER_MAX_MINUTES=1` in fly secrets, redeploy
- [ ] The clamp at runtime should treat this as 5 (the MIN floor) — confirm by observing that eviction happens after 5 min, not 1 min
- [ ] Set `BOT_TAKEOVER_MAX_MINUTES=99` → runtime should cap at 30 (MAX ceiling) — but this takes 30 min to verify; skip unless you specifically want to verify the upper bound

### Test 7 — Eviction during partie-end edge cases
- [ ] AFK eviction during TIEBREAK phase (rare): confirm the bot doesn't get stuck waiting for the evicted player's tiebreak throw
- [ ] AFK eviction of the LAST registered player in a room: the room dissolves cleanly (lone-survivor path)
- [ ] AFK eviction of the host: host migrates to the longest-tenured remaining player (same rule as admin-kick of the host)

---

## G92 — Pre-launch security audit

The dev test suite (`tests/integration/test_security.py`) verifies the
in-process behaviour of the new headers + reset-invalidates-sessions +
CORS allowlist + Sentry redaction. The items below need a real proxy
in front of us (Cloudflare → Fly) and can't be exercised from
`AsyncClient(transport=ASGITransport)`.

### Test 1 — Security headers on a real response
```
curl -I https://421bistro.com/healthz
```
- [ ] `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` present (must only ship over https)
- [ ] `X-Frame-Options: DENY`
- [ ] `X-Content-Type-Options: nosniff`
- [ ] `Referrer-Policy: strict-origin-when-cross-origin`
- [ ] `Content-Security-Policy: default-src 'self'; ...` matches the value built by `_build_csp(debug=False)`
- [ ] `Permissions-Policy` denies `camera`, `microphone`, `geolocation`, etc.

### Test 2 — Forgot-password rate limit
```
for i in $(seq 1 4); do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST -H 'Content-Type: application/json' \
    -d '{"email":"someone@example.com"}' \
    https://421bistro.com/auth/forgot-password
  sleep 1
done
```
- [ ] First 3 requests return 202
- [ ] 4th request returns 429 `{"detail":"rate_limit"}`
- [ ] Wait 1 hour, retry → back to 202

### Test 3 — CORS lockdown
- [ ] Preflight with `Origin: https://evil.example.com` returns NO `Access-Control-Allow-Origin: *` and NO echo of the evil origin
- [ ] Preflight with `Origin: https://421bistro.com` returns the matching `Access-Control-Allow-Origin: https://421bistro.com`
- [ ] Confirm `settings.cors_allowed_origins` in Fly env matches the production frontend host(s)

### Test 4 — Session invalidation on password reset
- [ ] Log in on browser A, copy the JWT (DevTools → Application → Local Storage)
- [ ] On browser B, do "forgot password" flow → reset to a new password
- [ ] Reload browser A → automatically logged out (401 on `/auth/me`)
- [ ] Browser A can re-log in with the new password

### Test 5 — Sentry redaction
- [ ] Force a 500 on `/auth/login` (e.g. by killing the DB pool mid-request)
- [ ] Open the Sentry event → confirm `request.data` shows `[redacted: auth route]` and `Authorization` header shows `[redacted]`
- [ ] Confirm the captured request body does NOT contain the plaintext password

### Test 6 — Anthropic / Brevo key rotation
- [ ] Follow the runbook in `docs/SECURITY.md` §3 to rotate `BREVO_API_KEY` → verify a fresh registration triggers a welcome email
- [ ] Rotate `ANTHROPIC_API_KEY` → verify avatar moderation still succeeds (fails open on missing key, so this only verifies the happy path)

---

## G77 — Production deployment itself

*Smoke tests for the deploy itself — DNS / SSL / Fly.io health checks /
Neon connection / Sentry alerting. Filled in during G77.*

---

## Verified runs

| Date (YYYY-MM-DD) | Feature | Prod commit | Result | Notes |
|---|---|---|---|---|
| _pending_ | G95 | — | — | Waiting on first deploy |
