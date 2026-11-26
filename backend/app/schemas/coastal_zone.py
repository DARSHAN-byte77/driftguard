from datetime import datetime
from pydantic import BaseModel, Field


class CoastalZoneCreate(BaseModel):
    zone_name: str = Field(min_length=2, max_length=150)
    state: str | None = Field(default=None, max_length=100)
    country: str = Field(min_length=2, max_length=100)
    description: str | None = None
    boundary_geojson: dict


class CoastalZoneUpdate(BaseModel):
    zone_name: str | None = Field(default=None, min_length=2, max_length=150)
    state: str | None = None
    country: str | None = Field(default=None, min_length=2, max_length=100)
    description: str | None = None
    boundary_geojson: dict | None = None


class CoastalZoneResponse(BaseModel):
    id: int
    zone_name: str
    state: str | None
    country: str
    description: str | None
    boundary_geojson: dict | None = None
    created_at: datetime
