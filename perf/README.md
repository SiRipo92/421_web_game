# Performance baseline — 421 Bistro

G99 backend perf scripts. Three k6 scenarios that exercise the load
profile we expect at launch. Run locally with:

```bash
brew install k6
# REST scenarios:
k6 run perf/auth_login.js
k6 run perf/room_lifecycle.js
# WS soak:
k6 run perf/ws_broadcast.js
```

All scenarios target `http://localhost:8421` by default. Override with
`BASE_URL` env var to point at a staging environment:

```bash
BASE_URL=https://staging.421bistro.com k6 run perf/auth_login.js
```

## Baseline numbers

See [docs/PERFORMANCE_BASELINE.md](../docs/PERFORMANCE_BASELINE.md) for
the captured numbers and what the SLOs are.

## CI integration

The full perf suite runs via `.github/workflows/perf.yml` on:
- `workflow_dispatch` (manual trigger from the Actions tab)
- PRs labelled `perf` (toggle the label when you want a perf-aware review)

Scenarios run inside a docker-compose stack on the GHA runner. Absolute
numbers won't match prod hardware (GHA runners are 2-core / 7GB), but
**trends across PRs** — which is what regression detection needs —
remain reliable.

## Files

- `auth_login.js` — 100 concurrent users, REST `/auth/login`. Target:
  p95 < 500ms, p99 < 1s, 0 errors.
- `room_lifecycle.js` — 50 users register → create room → play 3
  manches → leave. Target: p95 round-trip < 800ms, no WS disconnects.
- `ws_broadcast.js` — 1 room, 10 connected players, 5-minute soak.
  Target: every player receives every state broadcast within 100ms,
  no message loss.
- `helpers.js` — shared user-creation + JWT-extraction utilities.

## Notes

- Tests don't truncate the DB — they generate unique usernames per
  iteration so reruns don't collide.
- `auth_login.js` registers fresh users in the setup() stage, then
  pounds /auth/login for the test body.
- WS soak uses k6's experimental `k6/experimental/websockets` API
  (available since k6 v0.46).
