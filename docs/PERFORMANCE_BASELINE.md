# Performance baseline — 421 Bistro

G99 backend performance scenarios + their SLOs. This document is the
"these numbers are the trip-wire" reference. Future PRs that breach
these thresholds are caught either by:
1. The `perf.yml` GitHub Action enforcing the thresholds (it exits
   non-zero if k6's threshold checks fail).
2. A reviewer running `k6 run tests/perf/<scenario>.js` against a staging
   environment + comparing summary JSON against the baseline below.

Scripts live in [`tests/perf/`](../tests/perf/). See
[`tests/perf/README.md`](../tests/perf/README.md) for how to run them.

## Hardware caveat

The numbers below are captured on a GitHub Actions `ubuntu-latest`
runner (2 vCPU, 7GB RAM). Production runs on Fly.io `shared-cpu-1x`
(~1 vCPU, 256MB RAM by default) which is **slower** than a GHA runner
in raw single-core performance. SLOs should still hold because:
- the absolute scale is small (single-region, ~100s of concurrent
  users at launch);
- the dominant cost is async I/O + Postgres round-trips, which scale
  with network not CPU;
- we set the SLO ceilings with ~2x headroom over baseline.

Re-baseline when:
- We upgrade the Fly instance class.
- We move databases (e.g. Neon → Fly Postgres → managed Postgres).
- Any change to the WS broadcast loop or game loop touching every player.

## Scenarios

### 1. `auth_login.js` — login under burst load

100 concurrent users hitting `/auth/login` for 60 seconds, with a 30s
ramp-up + 10s ramp-down.

| Metric | Threshold | Baseline (GHA, 2026-06-20) |
|--------|-----------|----------------------------|
| `http_req_duration` p95 | **< 500ms** | _TBD — run perf.yml on dispatch to capture_ |
| `http_req_duration` p99 | **< 1s** | _TBD_ |
| `http_req_failed` rate | **0** | _TBD_ |

**Why these targets:** login is on every user's path; 500ms p95 keeps
the perceived latency below "I clicked, did something break?" Anything
slower than 1s p99 means the bcrypt cost factor is starving the worker
thread — that's the canary.

**If breached:** check (a) bcrypt cost factor (currently 12 — fine for
this hardware), (b) DB connection pool saturation (current default:
sqlalchemy pool_size=5).

### 2. `room_lifecycle.js` — register → create room → list

50 concurrent users walking the full "logged-in user makes a room" path
for 60s with a 20s ramp-up.

| Metric | Threshold | Baseline (GHA, 2026-06-20) |
|--------|-----------|----------------------------|
| `http_req_duration` p95 | **< 800ms** | _TBD_ |
| `http_req_failed` rate | **0** | _TBD_ |

**Why these targets:** room creation touches Postgres + the in-memory
games registry + the broadcast manager — three subsystems that have
to coordinate cleanly. A regression in any of them shows here first.

**If breached:** the in-memory `games: dict` doesn't have lock
contention (single-process), so a regression here points at Postgres
write latency. Check the new G99 `_write` defensive parse loops — if
they're scanning all `game.user_ids` entries linearly + the partie has
many players, it's quadratic per persist.

### 3. `ws_broadcast.js` — WS soak

10 connected players in the same room, 5-minute hold. Measures:
connect time, message-receive rate, dropped messages.

| Metric | Threshold | Baseline (GHA, 2026-06-20) |
|--------|-----------|----------------------------|
| `ws_connect_ms` p95 | **< 1s** | _TBD_ |
| `checks` rate (no errors) | **1.0** | _TBD_ |
| Per-VU message-receive variance | **< ±2 msgs from median** | _TBD_ |

**Why these targets:** the WS broadcast loop is the hottest code in the
app (a state push hits every connected client on every action). If
one client falls behind, the others might too — backpressure here is
the canary for a deadlock or a synchronous DB call slipped into the
hot path.

**If breached:** check (a) `manager.broadcast` for new awaits added
since last baseline; (b) the per-connection `send_json` doesn't hold
the connection-list lock; (c) Sentry events aren't being captured
synchronously inside the broadcast.

## Capturing the baseline

The "Baseline" column above is empty until the first manual run.
Capture it by:

```bash
# Locally (laptop hardware will differ — note that):
k6 run tests/perf/auth_login.js --summary-export=baseline_auth.json
k6 run tests/perf/room_lifecycle.js --summary-export=baseline_room.json

# Or via GHA: Actions tab → "Perf (k6)" → Run workflow → main branch.
# Download the k6-summaries artifact, copy p95/p99 + failure rate into
# the tables above, commit the update.
```

Then update the relevant tables in this file and commit with a message
like `docs(perf): G99 capture 2026-06-20 baseline`.

## Out of scope for G99

- **Frontend Web Vitals (LCP, FID, CLS).** Captured as G99 follow-up;
  not blocking launch because the bottleneck at our scale is backend.
- **Long-duration soak tests (>1h).** Useful for catching memory
  leaks but the WS broadcast scenario above is the heaviest async
  loop we have, and 5min covers the leak pattern (slow growth over
  iteration).
- **Real-user-monitoring (RUM).** Sentry's tracing collects some of
  this for free; expand if/when we have enough traffic to see meaningful
  numbers.
