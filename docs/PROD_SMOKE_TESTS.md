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

*Captured pre-emptively for when G93 ships. Production-only because the
real test requires a 10-minute AFK window where the bot keeps playing
and the eviction email needs to deliver via Brevo.*

(To be filled in when G93 work begins.)

---

## G77 — Production deployment itself

*Smoke tests for the deploy itself — DNS / SSL / Fly.io health checks /
Neon connection / Sentry alerting. Filled in during G77.*

---

## Verified runs

| Date (YYYY-MM-DD) | Feature | Prod commit | Result | Notes |
|---|---|---|---|---|
| _pending_ | G95 | — | — | Waiting on first deploy |
