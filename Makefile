.PHONY: dev dev-frontend dev-backend dev-env-watch build-frontend test lint ci-lint

dev: dev-backend

# Run the backend AND a tiny `.env` watcher in parallel. The watcher
# touches app/main.py whenever .env changes, which trips uvicorn's
# Python-file reloader and forces pydantic-settings to re-read the
# new values. Direct `--reload-include ".env"` doesn't work — uvicorn's
# watchfiles filter excludes hidden dotfiles. `trap` ensures the
# watcher dies when uvicorn does (Ctrl-C kills both).
dev-backend:
	@trap 'kill 0' INT; \
	.venv/bin/watchfiles --filter all "touch app/main.py" .env & \
	.venv/bin/uvicorn app.main:app --ws wsproto --host 0.0.0.0 --port 8421 --reload

dev-frontend:
	cd frontend && npm run dev -- --port 3000

build-frontend:
	cd frontend && npm run build

test:
	.venv/bin/pytest tests/ -v

# Apply migrations to the test database (one-time, after creating it in
# pgAdmin). Reads TEST_DATABASE_URL from .env and points alembic at it
# by overriding DATABASE_URL just for this invocation.
test-db-migrate:
	@source .env && DATABASE_URL="$$TEST_DATABASE_URL" .venv/bin/alembic upgrade head

lint:
	.venv/bin/ruff check app/ tests/ && .venv/bin/ruff format --check app/ tests/

# Mirror exactly what CI's Lint job runs. Catches format-check + frontend
# lint failures locally so we don't burn a CI cycle finding them after push.
# Run before `git push` on any branch with code changes.
ci-lint:
	.venv/bin/ruff check app/ tests/
	.venv/bin/ruff format --check app/ tests/
	cd frontend && npm run lint

# Build the Sphinx documentation site locally. Output: docs/build/html/.
# Open docs/build/html/index.html in a browser to preview.
# ReadTheDocs runs the equivalent of this on every push to main via
# .readthedocs.yaml — local previews catch broken references early.
docs:
	.venv/bin/sphinx-build -b html docs/source docs/build/html

docs-clean:
	rm -rf docs/build

# Code quality sweep — vulture (dead Python) + radon (cyclomatic complexity).
# Output is human-readable; tools don't enforce thresholds in CI.
# See docs/CODE_QUALITY_2026-06.md for the captured findings.
quality:
	.venv/bin/vulture app/ --min-confidence 80 || true
	.venv/bin/radon cc app/ -s -n B
