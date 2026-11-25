from datetime import datetime
from pydantic import BaseModel, Field


class DetectionCreate(BaseModel):
    satellite_image_id: int = Field(gt=0)
    coastal_zone_id: int = Field(gt=0)
    debris_category: str = Field(min_length=2, max_length=100)
    confidence_score: float | None = Field(default=None, ge=0, le=1)
    detection_status: str = "experimental_candidate"
    verification_status: str = Field(default="unverified", pattern="^(unverified|verified|rejected|needs_field_check)$")
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    area_estimate: float | None = Field(default=None, ge=0)


class VerificationUpdate(BaseModel):
    verification_status: str = Field(pattern="^(unverified|verified|rejected|needs_field_check)$")


class DetectionResponse(BaseModel):
    id: int
    satellite_image_id: int
    coastal_zone_id: int
    debris_category: str
    confidence_score: float | None
    detection_status: str
    verification_status: str
    latitude: float
    longitude: float
    area_estimate: float | None
    created_at: datetime

    model_config = {"from_attributes": True}
