# Deploy setup — 421 Bistro on Fly.io

One-time setup that gets the repo to "push to main → auto-deploys to
production." Pairs with [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml),
which sits inert until step 3 below is done.

The deploy pipeline:

```
git push origin main
       ↓
GHA workflow .github/workflows/deploy.yml
       ↓
flyctl deploy --remote-only      ← Fly builds the image on their builders
       ↓
Rolling deploy to your Fly app
```

No webhook, no separate CD service. The `flyctl` CLI handles
everything once it has a token.

---

## Prerequisites (one-time, on your laptop)

1. Install flyctl:
   ```bash
   brew install flyctl   # macOS
   # OR
   curl -L https://fly.io/install.sh | sh
   ```
2. Sign up / sign in:
   ```bash
   fly auth signup     # first time only
   fly auth login
   ```

   Use the same email tied to your billing — Fly's free tier covers a
   `shared-cpu-1x` instance + 3GB Postgres, which is enough for launch.

---

## Step 1 — Create the Fly app

From the repo root:

```bash
fly launch --no-deploy
```

The CLI prompts:
- **App name** — pick `421-bistro` or `four-twenty-one-bistro` (must be globally unique on Fly). This becomes the subdomain at `<name>.fly.dev`.
- **Region** — `cdg` (Paris) for EU users; `iad` (Virginia) if your audience is US-leaning.
- **Postgres** — answer **yes**. Fly provisions a managed Postgres cluster and writes the connection string to your app's secrets as `DATABASE_URL`.
- **Redis / Upstash** — answer **no** (the app doesn't use Redis).
- **Deploy now?** — answer **no**. We want secrets set first.

The command writes `fly.toml` to the repo root. The stub committed
here is a starting point; `fly launch` will update it with your real
app name + Postgres connection.

## Step 2 — Set production secrets

Production needs the same env vars as the `.env` you use in dev, plus
a few that only apply in prod.

```bash
fly secrets set \
  SECRET_KEY="$(python -c 'import secrets; print(secrets.token_hex(32))')" \
  BREVO_API_KEY="xkeysib-<your-key>" \
  GOOGLE_CLIENT_ID="<your-google-oauth-client-id>" \
  SENTRY_DSN="<your-sentry-dsn>" \
  ANTHROPIC_API_KEY="sk-ant-<your-key>" \
  APP_URL="https://421bistro.com" \
  SENDER_EMAIL="421 Bistro <noreply@421bistro.com>" \
  CONTACT_EMAIL="your-inbox@example.com" \
  CORS_ALLOWED_ORIGINS="https://421bistro.com"
```

Each `fly secrets set` triggers a rolling restart of the app, but
since we haven't deployed yet, it just stores the values.

`DATABASE_URL` is already set automatically by step 1 if you accepted
Postgres provisioning. Verify with `fly secrets list`.

## Step 3 — Generate a deploy token for GitHub Actions

```bash
fly tokens create deploy -x 8760h --name "github-actions-deploy"
```

The `-x 8760h` flag sets a 1-year expiry. The CLI prints a token
starting with `FlyV1 fm2_…`. **Copy it now — it's only shown once.**

Then add it to the repo's GitHub Actions secrets:

1. Go to <https://github.com/SiRipo92/421_web_game/settings/secrets/actions>
2. Click **New repository secret**
3. Name: `FLY_API_TOKEN`
4. Value: paste the token from above
5. **Add secret**

The deploy workflow reads this token via `secrets.FLY_API_TOKEN`. No
token = no deploy attempted (the workflow exits cleanly with a clear
message).

## Step 4 — First deploy

The first deploy needs to run from your laptop so you can watch for
errors interactively. Subsequent deploys go through GHA automatically.

```bash
fly deploy --remote-only
```

This:
- Builds the Docker image on Fly's builders (no local Docker required)
- Pushes it to Fly's registry
- Runs Alembic migrations via the `docker-entrypoint.sh` ENTRYPOINT
- Starts the new instance, drains the old one (rolling deploy)

Watch the output. If it hangs on "Configuring firecracker VM", check
`fly logs` in another terminal.

When it completes, your app is live at `<app-name>.fly.dev`. Visit
`/healthz` to confirm.

## Step 5 — Custom domain (optional)

If you're putting it on the CV at `421bistro.com`:

```bash
fly certs create 421bistro.com
fly certs create www.421bistro.com
```

Fly prints the DNS records to add at your registrar (typically an A
record for the apex and a CNAME for `www`). Once DNS propagates
(~5 min usually, up to 24h worst case), Fly auto-provisions a
Let's Encrypt cert.

Update `APP_URL` + `CORS_ALLOWED_ORIGINS` to the custom domain:

```bash
fly secrets set APP_URL="https://421bistro.com" \
                CORS_ALLOWED_ORIGINS="https://421bistro.com,https://www.421bistro.com"
```

## Step 6 — Verify the GHA workflow

Push a no-op commit to main to trigger the deploy workflow:

```bash
git commit --allow-empty -m "ci: trigger deploy workflow"
git push origin main
```

Watch the workflow run at <https://github.com/SiRipo92/421_web_game/actions/workflows/deploy.yml>.
If `FLY_API_TOKEN` is configured correctly, it deploys. If not, the
workflow logs say "FLY_API_TOKEN not set — skipping deploy" and
exits 0 (no failure, just a no-op).

---

## Operations cheat sheet

| Task | Command |
|---|---|
| Tail logs | `fly logs` |
| One-off SQL | `fly postgres connect -a <postgres-app-name>` |
| Restart app | `fly apps restart` |
| Roll back | `fly releases list` then `fly releases rollback <version>` |
| Scale up | `fly scale count 2` (more instances) or `fly scale vm shared-cpu-2x` (bigger VM) |
| Suspend / resume | `fly apps suspend` / `fly apps resume` |
| SSH in | `fly ssh console` |

## Rolling back a bad deploy

```bash
fly releases list                 # find the last-good version number
fly releases rollback v<N>        # instant — just flips traffic
```

`fly releases rollback` is **immediate** (re-attaches the previous
image, no rebuild). Use it without hesitation if the new release is
broken.

## Cost expectations

Fly's free tier covers:
- 3x `shared-cpu-1x` VMs (256MB RAM)
- 3GB Postgres storage
- 160GB/month outbound transfer

For 421 Bistro at launch: **1 app VM + 1 Postgres = $0/month** within
free tier. If traffic grows past ~10k MAU you'll move to paid
(`shared-cpu-2x` is ~$5/month).

## Troubleshooting

**Workflow says "FLY_API_TOKEN not set":** Step 3 wasn't done. Or the
secret name has a typo — must be exactly `FLY_API_TOKEN`.

**`flyctl deploy` hangs on "Configuring firecracker VM":** open
`fly logs` in another terminal. Usually means the container is
crashing during `alembic upgrade head` — check the migration history
and `DATABASE_URL` is set correctly.

**`/healthz` returns 502 after deploy:** the app didn't start. Check
`fly logs`. Common causes: missing env var, Postgres connection
refused (run `fly secrets list` to verify `DATABASE_URL`), or a
runtime exception during startup.

**Migration fails mid-deploy:** Fly's rolling deploy keeps the OLD
instance running. Fix the migration in a new commit + redeploy. If
the new release is partially applied, use `fly ssh console` then
`alembic downgrade -1` to roll back the schema, then redeploy.

**Custom domain not resolving:** `fly certs check 421bistro.com`
shows what's missing in DNS. Common: forgot the CNAME for `www`, or
the apex A record TTL hasn't expired.

---

## Going public — pre-launch checklist

Once steps 1-5 are done and `/healthz` returns 200 on the custom
domain, you're ready to:

- [ ] Run the manual smoke tests in [`docs/PROD_SMOKE_TESTS.md`](./PROD_SMOKE_TESTS.md)
- [ ] Run the security smoke tests in [`docs/SECURITY_AUDIT_2026-06.md`](./SECURITY_AUDIT_2026-06.md) §G92 test plan
- [ ] Verify Sentry is receiving events (deliberately trigger a 500 on a non-prod route)
- [ ] Capture k6 perf baselines via the `Perf (k6)` workflow on a dispatch run
- [ ] Flip the GitHub repo to public (Settings → General → Danger Zone)
- [ ] Update the CV link
