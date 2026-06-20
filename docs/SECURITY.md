# Security runbook — 421 Bistro

This document is the on-call playbook for security incidents and
ongoing security hygiene on `421bistro.com`. It is paired with
`docs/SECURITY_AUDIT_2026-06.md`, which is the dated punch list of
findings from the G92 pre-launch audit.

If you find a vulnerability and you're not a maintainer, please
disclose privately to **security@421bistro.com** rather than opening
a public GitHub issue. We will acknowledge within 72 hours.

---

## Table of contents

1. [Threat model](#1-threat-model)
2. [What's in scope](#2-whats-in-scope)
3. [Secrets management](#3-secrets-management)
4. [Authentication & sessions](#4-authentication--sessions)
5. [Rate limiting](#5-rate-limiting)
6. [HTTP hardening](#6-http-hardening)
7. [RGPD endpoints](#7-rgpd-endpoints)
8. [Dependency hygiene](#8-dependency-hygiene)
9. [Incident response](#9-incident-response)
10. [Quarterly review checklist](#10-quarterly-review-checklist)

---

## 1. Threat model

- **Attacker profile:** opportunistic — credential-stuffers, scrapers,
  abusers signing up to grief chat. Not a targeted nation-state.
- **Crown jewels:** user PII (email, hashed password, IP audit log),
  the JWT signing secret, the Brevo API key, the database itself.
- **Out of scope (for now):** DDoS at the network layer (handled by
  Cloudflare / Fly), physical theft, social engineering of staff.

## 2. What's in scope

- Backend: `app/` (FastAPI + WebSockets) deployed on Fly.io
- Frontend: `frontend/` (React + Vite) served from the same origin
- Database: managed Postgres (Fly Postgres)
- Email: Brevo (`xkeysib-` v3 API key)
- Auth: bcrypt + JWT (HS256) + Google SSO

## 3. Secrets management

- **Storage:** all secrets live in Fly's `fly secrets` store. The
  `.env` file is git-ignored and used in dev only.
- **Required secrets:** `SECRET_KEY`, `DATABASE_URL`, `BREVO_API_KEY`,
  `GOOGLE_CLIENT_ID`, `SENTRY_DSN`, `ANTHROPIC_API_KEY`.
- **Never log a secret.** Sentry has a `before_send` filter in
  `app/main.py` that scrubs Authorization headers, cookies, and auth
  request bodies. Add new scrub rules there when introducing new
  sensitive fields.

### Rotation runbook

A rotation should take <15 min and cause one auth session bump.

1. **Brevo (`BREVO_API_KEY`)**
   - Brevo dashboard → API keys → generate v3 key (`xkeysib-...`)
   - `fly secrets set BREVO_API_KEY=xkeysib-...` (triggers redeploy)
   - Revoke the old key in Brevo
2. **JWT (`SECRET_KEY`)**
   - Generate 64 hex chars: `python -c "import secrets; print(secrets.token_hex(32))"`
   - `fly secrets set SECRET_KEY=...` (triggers redeploy)
   - **All existing sessions are invalidated** — users will re-login.
     Post a banner in the lobby via admin broadcast first.
3. **Google client ID (`GOOGLE_CLIENT_ID`)**
   - GCP console → Credentials → create new OAuth client
   - Add `https://421bistro.com` to authorized origins
   - `fly secrets set GOOGLE_CLIENT_ID=...`
   - Delete the old client after 24h
4. **Anthropic (`ANTHROPIC_API_KEY`)**
   - Anthropic console → settings → keys
   - `fly secrets set ANTHROPIC_API_KEY=sk-ant-...`
   - Used only by avatar image moderation; failures fall open
     (image accepted) so a stale key won't block uploads
5. **Sentry (`SENTRY_DSN`)**
   - Sentry → settings → client keys
   - `fly secrets set SENTRY_DSN=...`
6. **Database (`DATABASE_URL`)**
   - Use `fly postgres connect` to rotate the user password
   - `fly secrets set DATABASE_URL=postgres://...`
   - A redeploy reconnects the pool

## 4. Authentication & sessions

- **Password storage:** bcrypt, default cost (12 rounds). Sufficient
  for 2026; revisit when cost-12 hashes can be brute-forced in <1s on
  commodity GPUs (~2030 estimate).
- **JWT algorithm:** HS256, signing key is `SECRET_KEY`. Token TTL is
  30 min by default, 30 days with `remember_me=true`.
- **Token version:** every user row has a `token_version` counter.
  Embedded in JWTs as `tv`. Bumped on password reset → invalidates
  all outstanding sessions for that user.
- **Google SSO:** verified server-side against Google's JWKs.
  `google_client_id` is required and validated as the audience.

### Manual session-kill (rare)

If an account is compromised and you need to log them out everywhere
without a password reset, increment `token_version` in the DB:

```sql
UPDATE users SET token_version = token_version + 1 WHERE id = '<uuid>';
```

## 5. Rate limiting

- Implemented via `slowapi` (`app/core/limiter.py`). Limits are per
  client IP — Fly's proxy forwards via `X-Forwarded-For`.
- Current limits:
  - `/auth/register` 5/min
  - `/auth/login` 10/min
  - `/auth/google` 10/min
  - `/auth/complete-profile` 10/min
  - `/auth/username-available` 10/min
  - `/auth/avatar` 10/min
  - `/auth/forgot-password` **3/hour** (G92 hardening)
  - `/auth/reset-password` 10/hour (G92 hardening)
- When tightening a limit, add a corresponding test in
  `tests/integration/test_auth.py`.

## 6. HTTP hardening

`SecurityHeadersMiddleware` in `app/middleware/security_headers.py`
sets these headers on every response:

| Header | Value | Why |
|--------|-------|-----|
| Strict-Transport-Security | `max-age=31536000; includeSubDomains; preload` | Forces HTTPS for 1 year |
| X-Frame-Options | `DENY` | Clickjacking defense |
| X-Content-Type-Options | `nosniff` | Stops content-type guessing |
| Referrer-Policy | `strict-origin-when-cross-origin` | No URL leakage |
| Permissions-Policy | `accelerometer=(), camera=(), …` | Deny unused browser APIs |
| Content-Security-Policy | strict allowlist | XSS + injection defense |

The CSP currently allows `'unsafe-inline'` for styles (React inline
`style={{...}}`); this is a known relaxation. Removing it is tracked
in the roadmap as a follow-up.

CORS is locked to `settings.cors_allowed_origins` (comma-separated).
Production should set this to `https://421bistro.com` only. Dev
defaults to `http://localhost:5173,http://localhost:8421`.

## 7. RGPD endpoints

- `GET /auth/export` — JSON dump of all stored personal data for the
  authenticated user.
- `DELETE /auth/me` — soft-delete with immediate anonymization
  (username + email freed; hashed_password nulled). The G70 cron
  hard-deletes after the configured grace period.
- `GdprAuditLog` records every account-affecting event for the legal
  retention window (`settings.moderation_log_retention_days`).

## 8. Dependency hygiene

- **Python:** `pip-audit` runs in CI on every PR. Local check:
  `pip-audit -r requirements.txt`. Resolve advisories before merge.
- **Node:** `npm audit` runs in CI under `frontend/`. Local check:
  `cd frontend && npm audit`. `npm audit fix` for non-breaking
  upgrades; coordinate breaking ones in a dedicated PR.
- **Sentry:** if a vuln lands in `sentry-sdk` itself, the
  `before_send` filter is a relevant remediation: bump it, audit
  what new event fields might be leaking, and verify the test in
  `tests/integration/test_security.py` still passes.

## 9. Incident response

If you suspect an active compromise:

1. **Triage (within 1h):** confirm the scope. Sentry alerts? Unusual
   admin actions in `GdprAuditLog`? Customer report?
2. **Contain (within 4h):**
   - If credentials may be compromised: rotate `SECRET_KEY`. Every
     user re-logs in.
   - If an admin account is compromised: demote via
     `UPDATE users SET role='player' WHERE id='<uuid>'` and bump
     their `token_version`.
   - If the DB is compromised: snapshot, restore to a new instance,
     repoint `DATABASE_URL`.
3. **Eradicate:** find the entry point (Sentry trace? access log?).
   Patch. Add a regression test.
4. **Notify:** within 72h of confirmed personal-data breach, notify
   affected users via the email pipeline (template
   `breach_notification.{fr,en}.html`) and the CNIL per RGPD Art. 33.
5. **Post-mortem:** within 1 week, write up in
   `docs/incidents/YYYY-MM-DD-<slug>.md`. What happened, timeline,
   what was leaked, what changed.

### Useful contacts

- **Hosting (Fly.io):** support@fly.io
- **Email (Brevo):** dashboard → support
- **DNS (Cloudflare):** dashboard → support
- **RGPD authority (FR):** cnil.fr/en/notifying-personal-data-breach

## 10. Quarterly review checklist

Schedule on the calendar — first business day of each quarter.

- [ ] Rotate `SECRET_KEY` (forces global re-login; coordinate with
      a low-traffic window and an admin broadcast)
- [ ] Run `pip-audit` + `npm audit` against `main`; open issues for
      any findings not yet auto-fixed
- [ ] Verify Sentry `before_send` still scrubs the current set of
      sensitive headers / fields (a new auth route might add one)
- [ ] Re-run the test in `tests/integration/test_security.py` and
      manually curl `/healthz` to confirm headers in production
- [ ] Review the last quarter of `GdprAuditLog` for any anomalies
- [ ] Update this runbook's contact + rotation steps if anything
      changed
