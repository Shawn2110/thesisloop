from contextlib import asynccontextmanager
from pathlib import Path
from typing import Iterator, Union

from fastapi import Depends, FastAPI, Header, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from .database import Base, DATABASE_URL, SessionLocal, engine
from .models import Setup
from .schemas import HealthRead, OutcomeCreate, SetupCreate, SetupList, SetupRead
from .seed import fresh_seed_setups


def get_session() -> Iterator[Session]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def seed_if_empty(session: Session, workspace_id: str) -> None:
    count = session.scalar(select(func.count()).select_from(Setup).where(Setup.workspace_id == workspace_id))
    if count == 0:
        rows = fresh_seed_setups()
        for row in rows:
            row.workspace_id = workspace_id
        session.add_all(rows)
        session.commit()


def get_workspace_id(x_workspace_id: str = Header(min_length=8, max_length=128)) -> str:
    return x_workspace_id


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)
    yield


app = FastAPI(title="ThesisLoop API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health", response_model=HealthRead)
def health() -> HealthRead:
    database = "postgresql" if DATABASE_URL.startswith("postgresql") else "sqlite"
    return HealthRead(status="ok", database=database)


@app.get("/api/setups", response_model=SetupList)
def list_setups(workspace_id: str = Depends(get_workspace_id), session: Session = Depends(get_session)) -> SetupList:
    seed_if_empty(session, workspace_id)
    rows = session.scalars(select(Setup).where(Setup.workspace_id == workspace_id).order_by(Setup.created_at.desc(), Setup.id.desc())).all()
    return SetupList(setups=list(rows))


@app.post("/api/setups", response_model=SetupList, status_code=status.HTTP_201_CREATED)
def create_setups(payload: Union[SetupCreate, list[SetupCreate]], workspace_id: str = Depends(get_workspace_id), session: Session = Depends(get_session)) -> SetupList:
    items = payload if isinstance(payload, list) else [payload]
    if not items or len(items) > 500:
        raise HTTPException(status_code=400, detail="Import between 1 and 500 records.")

    rows: list[Setup] = []
    for item in items:
        values = item.model_dump()
        if values["status"] == "closed":
            if values["return_pct"] is None or values["followed_plan"] is None or not values["outcome_note"]:
                raise HTTPException(status_code=400, detail="Closed records need a return, plan status and outcome note.")
        else:
            values.update(return_pct=None, followed_plan=None, outcome_note=None)
        rows.append(Setup(workspace_id=workspace_id, **values))

    session.add_all(rows)
    session.commit()
    for row in rows:
        session.refresh(row)
    return SetupList(setups=rows)


@app.patch("/api/setups/{setup_id}/outcome", response_model=SetupRead)
def close_setup(setup_id: int, payload: OutcomeCreate, workspace_id: str = Depends(get_workspace_id), session: Session = Depends(get_session)) -> Setup:
    row = session.scalar(select(Setup).where(Setup.id == setup_id, Setup.workspace_id == workspace_id))
    if not row:
        raise HTTPException(status_code=404, detail="Setup not found.")
    if row.status == "closed":
        raise HTTPException(status_code=409, detail="This setup already has a saved outcome.")

    row.status = "closed"
    row.return_pct = payload.return_pct
    row.followed_plan = payload.followed_plan
    row.outcome_note = payload.outcome_note
    session.commit()
    session.refresh(row)
    return row


@app.post("/api/setups/reset", response_model=SetupList)
def reset_setups(workspace_id: str = Depends(get_workspace_id), session: Session = Depends(get_session)) -> SetupList:
    session.execute(delete(Setup).where(Setup.workspace_id == workspace_id))
    rows = fresh_seed_setups()
    for row in rows:
        row.workspace_id = workspace_id
    session.add_all(rows)
    session.commit()
    for row in rows:
        session.refresh(row)
    return SetupList(setups=rows)


FRONTEND_DIST = Path(__file__).resolve().parents[1] / "frontend" / "dist"
ASSETS_DIR = FRONTEND_DIST / "assets"

if ASSETS_DIR.exists():
    app.mount("/assets", StaticFiles(directory=ASSETS_DIR), name="assets")


@app.get("/api/{unknown_path:path}", include_in_schema=False)
def unknown_api(unknown_path: str) -> None:
    raise HTTPException(status_code=404, detail=f"Unknown API route: {unknown_path}")


@app.get("/{full_path:path}", include_in_schema=False)
def serve_frontend(full_path: str) -> Response:
    candidate = (FRONTEND_DIST / full_path).resolve()
    if FRONTEND_DIST.exists() and candidate.is_file() and FRONTEND_DIST in candidate.parents:
        return FileResponse(candidate)
    index = FRONTEND_DIST / "index.html"
    if index.exists():
        return FileResponse(index)
    raise HTTPException(status_code=503, detail="Frontend build is not available. Run the frontend build first.")
