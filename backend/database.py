import os

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import StaticPool


def _database_url() -> str:
    url = os.getenv("DATABASE_URL", "sqlite:///./thesisloop.db")
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+psycopg://", 1)
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+psycopg://", 1)
    return url


DATABASE_URL = _database_url()
CONNECT_ARGS = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
ENGINE_OPTIONS = {"poolclass": StaticPool} if DATABASE_URL == "sqlite://" else {"pool_pre_ping": True}

engine = create_engine(DATABASE_URL, connect_args=CONNECT_ARGS, **ENGINE_OPTIONS)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass
