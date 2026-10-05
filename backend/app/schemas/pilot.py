from datetime import date
from pydantic import BaseModel, ConfigDict, Field, model_validator
from app.schemas.kpi import KPIResponse
from app.schemas.decision import DecisionResponse
from decimal import Decimal
from app.schemas.milestone import MilestoneResponse

class PilotBase(BaseModel):
    scope: str = Field(..., min_length=5)
    timeline_start: date
    timeline_end: date

    @model_validator(mode="after")
    def validate_dates(self):
        if self.timeline_end < self.timeline_start:
            raise ValueError("timeline_end must be greater than or equal to timeline_start")
        return self

class PilotCreate(PilotBase):
    application_id: int
    total_budget: Decimal | None = None

class PilotBudgetUpdate(BaseModel):
    total_budget: Decimal
    
from typing import Any
class PilotResponse(PilotBase):
    id: int
    application_id: int
    status: str
    total_budget: Decimal | None = None
    kpis: list[KPIResponse] = []
    milestones: list[MilestoneResponse] = []
    decision: DecisionResponse | None = None
    application: dict | None = None

    @model_validator(mode="before")
    @classmethod
    def populate_application_dict(cls, values):
        if hasattr(values, "application") and getattr(values, "application"):
            app_obj = values.application
            startup_obj = getattr(app_obj, "startup", None)
            challenge_obj = getattr(app_obj, "challenge", None)
            app_dict = {
                "id": app_obj.id,
                "startup": {"name": startup_obj.name, "dpiit_status": startup_obj.dpiit_status} if startup_obj else {},
                "challenge": {"title": challenge_obj.title} if challenge_obj else {}
            }
            if not isinstance(values, dict):
                # Convert ORM to dict to avoid mutating ORM state
                d = {c.name: getattr(values, c.name) for c in values.__table__.columns}
                d["kpis"] = getattr(values, "kpis", [])
                d["milestones"] = getattr(values, "milestones", [])
                d["decision"] = getattr(values, "decision", None)
                d["application"] = app_dict
                return d
            else:
                values["application"] = app_dict
        return values

    model_config = ConfigDict(from_attributes=True)
