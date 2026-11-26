from datetime import datetime
from pydantic import BaseModel, Field


class ReportGenerateRequest(BaseModel):
    coastal_zone_id: int = Field(gt=0)
    report_title: str | None = Field(default=None, max_length=200)


class ReportResponse(BaseModel):
    id: int
    coastal_zone_id: int
    report_title: str
    priority_level: str
    detection_count: int
    recommendations: str
    report_status: str
    created_at: datetime

    model_config = {"from_attributes": True}
