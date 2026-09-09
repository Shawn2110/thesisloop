# ThesisLoop

ThesisLoop is a decision review journal for traders. It preserves the thesis written before an outcome, connects it to the later result and reflection, and shows descriptive patterns across closed cases.

## Architecture

- React and TypeScript frontend built with Vite
- FastAPI backend that serves both the API and the compiled frontend
- SQLAlchemy data layer
- PostgreSQL in production
- SQLite fallback for local development and automated tests

The original thesis has no update endpoint. Closing a decision loop adds an outcome without rewriting the original record.

Each browser receives an anonymous workspace ID. The API scopes every query and reset to that workspace so visitors to the public demo cannot see or replace another visitor's journal.

## Local setup

Requirements:

- Python 3.9 or later
- Node.js 20 or later
- PostgreSQL when testing the production database path

Create the Python environment and install the backend:

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
```

Install and build the frontend:

```bash
cd frontend
npm install
npm run build
cd ..
```

Start the complete application:

```bash
.venv/bin/uvicorn backend.main:app --reload
```

Open `http://127.0.0.1:8000`. Without `DATABASE_URL`, the application creates a local SQLite database. To use PostgreSQL, copy `.env.example` and export the connection value before starting the server.

## Development mode

Run FastAPI on port 8000, then start Vite in a second terminal:

```bash
cd frontend
npm run dev
```

Vite opens on `http://127.0.0.1:5173` and proxies API requests to FastAPI.

## API

- `GET /api/health`
- `GET /api/setups`
- `POST /api/setups`
- `PATCH /api/setups/{id}/outcome`
- `POST /api/setups/reset`
- Interactive documentation at `/docs`

## Tests

```bash
.venv/bin/pytest backend/test_api.py
cd frontend && npm run build
```

## Deployment

`render.yaml` defines one containerized FastAPI web service and its PostgreSQL database. The Docker build compiles the React frontend, installs the Python backend and serves everything from one public origin.
