from datetime import datetime
from pydantic import BaseModel, Field


class SatelliteSearchResponse(BaseModel):
    product_id: str
    title: str | None = None
    acquisition_date: datetime | None = None
    cloud_percentage: float | None = None
    satellite_name: str | None = None


class SatelliteFetchRequest(BaseModel):
    product_id: str = Field(min_length=3)
    coastal_zone_id: int = Field(gt=0)


class SatelliteImageResponse(BaseModel):
    id: int
    coastal_zone_id: int
    satellite_name: str
    product_id: str
    acquisition_date: datetime
    cloud_percentage: float | None
    image_path: str | None
    thumbnail_path: str | None
    processing_status: str
    created_at: datetime

    model_config = {"from_attributes": True}
