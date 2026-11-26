from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from geoalchemy2.shape import from_shape, to_shape
from shapely.geometry import shape
from app.database.connection import get_db
from app.models.coastal_zone import CoastalZone
from app.schemas.coastal_zone import CoastalZoneCreate, CoastalZoneUpdate

router = APIRouter(prefix="/api/zones", tags=["Coastal Zones"])


def serialize(zone: CoastalZone) -> dict:
    return {"id": zone.zone_id, "zone_name": zone.zone_name, "latitude": zone.latitude, "longitude": zone.longitude, "region": zone.region}


@router.get("", response_model=dict)
def list_zones(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100), country: str | None = None, db: Session = Depends(get_db)):
    query = db.query(CoastalZone)
    if country:
        query = query.filter(CoastalZone.region.ilike(f"%{country}%"))
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    return {"success": True, "data": {"items": [serialize(z) for z in items], "total": total, "page": page, "page_size": page_size}, "error": None}


@router.post("", response_model=dict, status_code=201)
def create_zone(payload: CoastalZoneCreate, db: Session = Depends(get_db)):
    geo = shape(payload.boundary_geojson)
    if geo.geom_type != "Polygon":
        raise HTTPException(status_code=422, detail="boundary_geojson must be a Polygon")
    centroid = geo.centroid
    region = payload.state or payload.country
    zone = CoastalZone(zone_name=payload.zone_name, latitude=centroid.y, longitude=centroid.x, region=region)
    db.add(zone)
    db.commit()
    db.refresh(zone)
    return {"success": True, "data": serialize(zone), "error": None}


@router.get("/{zone_id}", response_model=dict)
def get_zone(zone_id: int, db: Session = Depends(get_db)):
    zone = db.get(CoastalZone, zone_id)
    if not zone:
        raise HTTPException(status_code=404, detail="Coastal zone not found")
    return {"success": True, "data": serialize(zone), "error": None}


@router.put("/{zone_id}", response_model=dict)
def update_zone(zone_id: int, payload: CoastalZoneUpdate, db: Session = Depends(get_db)):
    zone = db.get(CoastalZone, zone_id)
    if not zone:
        raise HTTPException(status_code=404, detail="Coastal zone not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        if field == "boundary_geojson":
            centroid = shape(value).centroid
            zone.latitude = centroid.y
            zone.longitude = centroid.x
        elif field in {"state", "country", "description"}:
            if field in {"state", "country"}:
                zone.region = value
        elif field == "zone_name":
            zone.zone_name = value
    db.commit()
    db.refresh(zone)
    return {"success": True, "data": serialize(zone), "error": None}


@router.delete("/{zone_id}", status_code=204)
def delete_zone(zone_id: int, db: Session = Depends(get_db)):
    zone = db.get(CoastalZone, zone_id)
    if not zone:
        raise HTTPException(status_code=404, detail="Coastal zone not found")
    db.delete(zone)
    db.commit()
    return None
