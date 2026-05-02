.PHONY: dev test lint

dev:
	.venv/bin/uvicorn app.main:app --ws wsproto --host 0.0.0.0 --port 8421 --reload

test:
	.venv/bin/pytest tests/ -v

lint:
	.venv/bin/ruff check app/ tests/ && .venv/bin/ruff format --check app/ tests/
