.PHONY: dev dev-frontend dev-backend build-frontend test lint

dev: dev-backend

dev-backend:
	.venv/bin/uvicorn app.main:app --ws wsproto --host 0.0.0.0 --port 8421 --reload

dev-frontend:
	cd frontend && npm run dev -- --port 3000

build-frontend:
	cd frontend && npm run build

test:
	.venv/bin/pytest tests/ -v

lint:
	.venv/bin/ruff check app/ tests/ && .venv/bin/ruff format --check app/ tests/
