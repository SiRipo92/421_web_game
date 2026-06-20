<!--
Uncheck items only with a reason in the "Notes for review" section.
-->

## Summary

<!-- 1-3 bullets on what changed and why. -->

## Roadmap

<!-- Link to the docs/ROADMAP.md entry this PR closes or progresses.
     For trivial drive-bys, write "N/A". -->

Closes/Progresses: G<number>

## Test plan

- [ ] `pytest --cov=app --cov-fail-under=85` passes locally
- [ ] `ruff check app/ tests/` clean
- [ ] `ruff format --check app/ tests/` clean
- [ ] `cd frontend && npm run lint` clean
- [ ] Playwright suite green (`cd frontend && npx playwright test`)
- [ ] New code has unit OR integration tests in the same commit
- [ ] If this touches UI, manual smoke captured in `docs/PROD_SMOKE_TESTS.md`
- [ ] If this touches DB schema, Alembic migration committed

## Security

- [ ] No secrets in commits or commit messages (passwords, API keys, JWTs, DB URLs)
- [ ] No new third-party calls without rate limit + timeout
- [ ] If auth/session code changed, `docs/SECURITY.md` updated
- [ ] PR targets `develop` (not `main`)

## Notes for review

<!-- Anything reviewers should look at first, known limitations,
     deferred work, follow-up issues. -->
