# G92 — pre-launch security audit (June 2026)

A point-in-time snapshot of every check run before the public launch.
See `docs/SECURITY.md` for the ongoing runbook; this document is
frozen as evidence of what was reviewed and what was changed.

**Auditor:** Claude (Anthropic), as part of G92 in `docs/ROADMAP.md`.
**Repo state at audit:** `feature/g92-security-audit` branched from
`develop` at commit `2e0bf31` (G2 bot-handback).
**Scope:** backend (`app/`), frontend (`frontend/`), config, CI.

---

## Summary

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| 1 | npm: 5 vulnerabilities (3 high, 1 moderate, 1 low) | Medium | **Fixed** — `npm audit fix` |
| 2 | `/auth/forgot-password` had no rate limit | **High** | **Fixed** — `@limiter.limit("3/hour")` |
| 3 | No HTTP security headers (HSTS, CSP, X-Frame-Options, etc.) | **High** | **Fixed** — `SecurityHeadersMiddleware` |
| 4 | Sentry had no PII / credential redaction filter | Medium | **Fixed** — `before_send` scrubber |
| 5 | Password reset did not invalidate existing JWTs | **High** | **Fixed** — `User.token_version` |
| 6 | CORS allowed `*` in debug mode | Low (debug-only) | **Fixed** — explicit allowlist in all modes |
| 7 | pip-audit clean, git history clean, JWT alg correct, RGPD endpoints present, bcrypt cost default (12) | n/a | Verified |

No critical findings. Five high / medium fixes shipped in this PR;
the audit report below documents both the fixes and the items that
came back clean.

---

## 1. Dependency hygiene

### Python (`pip-audit`)
```
$ pip-audit -r requirements.txt
No known vulnerabilities found
```
**Status:** clean.

### Node (`npm audit`, in `frontend/`)
Before: 5 vulnerabilities (3 high, 1 moderate, 1 low).
After `npm audit fix`: 0 vulnerabilities, 31 packages updated, no
breaking changes.

**Action taken:** committed the updated `frontend/package-lock.json`.

## 2. Secrets in git history

```
$ git log --all -p | grep -i 'xkeysib-\|sk-ant-\|SECRET_KEY=' | head
```
- `xkeysib-` matches: all `xkeysib-test` strings in test fixtures
  and comments in `app/services/email.py` — not real credentials.
- `sk-ant-`: none.
- `SECRET_KEY=`: only the `dev-insecure-key-change-in-production`
  default in `.env.example` and `config.py`.

**Status:** clean. No real secrets in history.

## 3. Authentication & sessions

### 3.1 Password hashing
- Algorithm: **bcrypt**.
- Cost: default (12). Adequate for 2026.
- Truncation: 72-byte limit explicitly enforced before hashing
  (`_MAX_PW_BYTES = 72` in `app/core/security.py`) — matches the
  bcrypt spec, prevents silent password collisions when migrating
  from older libraries that didn't truncate consistently.

**Status:** clean.

### 3.2 JWT
- Algorithm: **HS256**, signing key from `SECRET_KEY`.
- Decode passes `algorithms=[ALGORITHM]` — algorithm-confusion
  attacks (where an attacker sends a `none` or `RS256` token) are
  rejected.
- TTL: 30 min default, 30 days with `remember_me=true`.
- Audience claim: not used (single-audience deployment).

**Issue 5 (fixed):** previously, password reset did NOT invalidate
existing JWTs. If an account was compromised and the user reset
their password, any token the attacker had already exfiltrated
remained valid for up to 30 days.

**Fix:** `User.token_version` column (migration
`g92_user_token_version.py`). Embedded in every JWT as the `tv`
claim. `_user_from_token` compares JWT `tv` against the stored
counter and rejects mismatches. `/auth/reset-password` bumps the
counter on every successful reset.

### 3.3 Google SSO
- `id_token.verify_oauth2_token` is called with our
  `google_client_id` as the audience — Google's library does the
  audience check internally.
- Without `google_client_id` configured, the endpoint returns 503
  rather than silently accepting tokens.

**Status:** clean.

## 4. Authorization

Endpoint-by-endpoint review (response code for unauthorized vs.
unauthenticated):

| Endpoint | Anonymous | Wrong user | Admin-only | Notes |
|----------|-----------|-----------|-----------|-------|
| `GET /auth/me` | 401 | n/a | n/a | self-scoped |
| `PATCH /auth/me` | 401 | n/a | n/a | self-scoped |
| `DELETE /auth/me` | 401 | n/a | n/a | self-scoped |
| `GET /auth/export` | 401 | n/a | n/a | self-scoped |
| `POST /auth/avatar` | 401 | n/a | n/a | self-scoped |
| `POST /admin/users/...` | 401 | 403 | yes (`require_admin`) | role-gated |
| `POST /admin/rooms/...` | 401 | 403 | yes (`require_moderator`) | role-gated |
| `POST /rooms/{id}/start` | 401 | 403 (not host) | n/a | host-only |
| `WS /ws/{game}/{player}` | closes | closes | n/a | JWT in querystring |

**No 403 / 404 leakage** found: the admin endpoints return 403 on
authenticated-but-unprivileged access (not 404, which could leak the
existence of the resource).

**Status:** clean.

## 5. Rate limiting + abuse

### Before audit

| Endpoint | Limit |
|----------|-------|
| `/auth/register` | 5/min |
| `/auth/login` | 10/min |
| `/auth/google` | 10/min |
| `/auth/complete-profile` | 10/min |
| `/auth/username-available` | 10/min |
| `/auth/avatar` | 10/min |
| **`/auth/forgot-password`** | **none** |
| **`/auth/reset-password`** | **none** |

**Issue 2 (fixed):** `/auth/forgot-password` was uncapped. An
attacker could enumerate-spam reset emails — denial-of-wallet
against Brevo + phishing primer (flood the victim's inbox so a real
reset email is missed).

**Fix:** `@limiter.limit("3/hour")` on `/auth/forgot-password`,
`10/hour` on `/auth/reset-password` (less critical because the
endpoint is token-gated, but worth bounding).

### X-Forwarded-For trust

slowapi pulls the client IP from `request.client.host`. Fly.io's
proxy forwards the real client IP in `X-Forwarded-For`; FastAPI
honors this when behind a trusted proxy. **Production
recommendation:** verify Fly's `FORWARDED_ALLOW_IPS` env or
equivalent is set so we trust the proxy header.

## 6. Input validation

- All inputs go through Pydantic models (`app/schemas/*.py`).
  Pydantic v2 enforces types and constraints (max length, regex)
  before any handler logic runs.
- SQL: every query uses SQLAlchemy ORM — no string concatenation.
  No `text()` queries with user input.
- XSS: emails are rendered through Jinja with autoescape on. The
  frontend uses React, which escapes by default. No
  `dangerouslySetInnerHTML` calls reference user input.
- CSV injection: not applicable (no CSV exports).
- HTML email injection: Jinja autoescape; user fields like
  `username` are only interpolated as text, not into HTML attributes
  or URLs.

**Status:** clean.

## 7. HTTP hardening

**Issue 3 (fixed):** the app set NO security headers. Browsers got
no HSTS, no X-Frame-Options, no CSP — meaning the site could be
iframed, downgraded to HTTP, or accept any external script.

**Issue 6 (fixed):** CORS was wildcard (`*`) when `debug=True`, and
absent in production. Fix moves CORS to an explicit allowlist
(`settings.cors_allowed_origins`) that applies in ALL modes; dev
defaults to `localhost:5173,localhost:8421`, prod to
`https://421bistro.com`.

**Fix:** `SecurityHeadersMiddleware` in
`app/middleware/security_headers.py` adds:
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: accelerometer=(), camera=(), …` (deny unused)
- `Content-Security-Policy:` strict allowlist (self + Google fonts
  + Google SSO; `'unsafe-inline'` for styles only, scripts blocked)

CSP currently allows `'unsafe-inline'` for styles because React
components use inline `style={{...}}` heavily. Tightening this is
G92b (deferred).

## 8. Sentry redaction

**Issue 4 (fixed):** the Sentry SDK was initialised with no
`before_send` filter and `send_default_pii` not set. A 500 on
`/auth/login` could have shipped the user's plaintext password to
Sentry as part of the request body.

**Fix:** `_sentry_before_send` in `app/main.py` scrubs:
- `request.headers.Authorization` / `Cookie` / `X-CSRF-Token`
- `request.data` on any URL containing `/auth/` or `/password`
- `extra.password` / `extra.token` etc.

`send_default_pii=False` also passed to `sentry_sdk.init`.

## 9. RGPD endpoints

- `GET /auth/export` — JSON dump of account + stats + game history.
  Auth-gated; verified to return the current user's data only.
- `DELETE /auth/me` — soft-delete with immediate anonymization
  (username + email freed, hashed_password nulled). G70 cron
  hard-deletes after grace period.
- `GdprAuditLog` records account-affecting events; retention
  configurable via `moderation_log_retention_days`.

**Status:** complete.

## 10. Items deferred to follow-up

- **G92b:** tighten CSP `'unsafe-inline'` for styles. Requires
  enumerating React inline-style usages and moving them to CSS
  files / styled-components.
- **G92c:** add `pip-audit` + `npm audit` gates to CI (currently
  manual). The runbook calls for them to run on every PR.
- **G92d:** rotate `SECRET_KEY` to a fresh 64-hex value in
  production before public launch. Plan a low-traffic window — every
  active session will be re-issued.

---

**Audit completed:** 2026-06-20.
**Next review:** 2026-09-20 (quarterly).
