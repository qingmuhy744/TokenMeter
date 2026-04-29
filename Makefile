.PHONY: install dev build test lint docker clean

install:
	uv sync
	cd frontend && npm install

dev:
	cd frontend && npm run dev &
	uv run uvicorn backend.main:app --reload --port 8000

build:
	cd frontend && npm run build

test:
	uv run pytest -v
	cd frontend && npx tsc --noEmit

lint:
	uv run ruff check backend/
	cd frontend && npx eslint src/

docker:
	docker build -t token-speed-test .

clean:
	find . -type d -name __pycache__ -exec rm -rf {} +
	rm -rf *.db frontend/dist frontend/node_modules .pytest_cache
