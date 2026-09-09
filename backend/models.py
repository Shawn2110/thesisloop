from datetime import date
from typing import Optional

from sqlalchemy import Boolean, Date, Float, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class Setup(Base):
    __tablename__ = "setups"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    workspace_id: Mapped[str] = mapped_column(String(128), index=True)
    symbol: Mapped[str] = mapped_column(String(12), index=True)
    setup: Mapped[str] = mapped_column(String(120))
    source: Mapped[str] = mapped_column(String(160), index=True)
    thesis: Mapped[str] = mapped_column(Text)
    planned_risk: Mapped[float] = mapped_column(Float)
    created_at: Mapped[date] = mapped_column(Date, index=True)
    status: Mapped[str] = mapped_column(String(12), default="open", index=True)
    return_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    followed_plan: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    outcome_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
