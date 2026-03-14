.PHONY: dev test seed build clean install

install:
	python3 -m venv .venv
	. .venv/bin/activate && pip install -r backend/requirements.txt
	cd frontend && npm install

dev:
	@echo "Starting backend on port 3002 and frontend on port 5002..."
	@. .venv/bin/activate && cd backend && uvicorn app.main:app --host 0.0.0.0 --port 3002 --reload &
	@cd frontend && npm run dev &
	@echo "Backend: http://localhost:3002"
	@echo "Frontend: http://localhost:5002"

test:
	. .venv/bin/activate && cd backend && TESTING=true python3 -m pytest tests/ -v

seed:
	. .venv/bin/activate && cd backend && python3 seed.py

build:
	cd frontend && npm run build

clean:
	rm -rf .venv
	rm -rf frontend/node_modules frontend/.next
	rm -rf backend/__pycache__ backend/app/__pycache__
	rm -f backend/test.db
