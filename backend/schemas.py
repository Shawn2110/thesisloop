from datetime import date
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


def to_camel(value: str) -> str:
    first, *rest = value.split("_")
    return first + "".join(word.capitalize() for word in rest)


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


class SetupCreate(ApiModel):
    symbol: str = Field(min_length=1, max_length=12)
    setup: str = Field(min_length=1, max_length=120)
    source: str = Field(min_length=1, max_length=160)
    thesis: str = Field(min_length=1, max_length=5000)
    planned_risk: float = Field(gt=0, le=100)
    created_at: date
    status: str = "open"
    return_pct: Optional[float] = None
    followed_plan: Optional[bool] = None
    outcome_note: Optional[str] = Field(default=None, max_length=5000)

    @field_validator("symbol")
    @classmethod
    def normalize_symbol(cls, value: str) -> str:
        return value.strip().upper()

    @field_validator("setup", "source", "thesis")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        clean = value.strip()
        if not clean:
            raise ValueError("must not be blank")
        return clean

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str) -> str:
        if value not in {"open", "closed"}:
            raise ValueError("must be open or closed")
        return value

    @field_validator("outcome_note")
    @classmethod
    def strip_optional_text(cls, value: Optional[str]) -> Optional[str]:
        return value.strip() if value and value.strip() else None


class OutcomeCreate(ApiModel):
    return_pct: float = Field(ge=-1000, le=10000)
    followed_plan: bool
    outcome_note: str = Field(min_length=1, max_length=5000)

    @field_validator("outcome_note")
    @classmethod
    def strip_outcome(cls, value: str) -> str:
        clean = value.strip()
        if not clean:
            raise ValueError("must not be blank")
        return clean


class SetupRead(ApiModel):
    id: int
    symbol: str
    setup: str
    source: str
    thesis: str
    planned_risk: float
    created_at: date
    status: str
    return_pct: Optional[float]
    followed_plan: Optional[bool]
    outcome_note: Optional[str]


class SetupList(ApiModel):
    setups: list[SetupRead]


class HealthRead(ApiModel):
    status: str
    database: str
