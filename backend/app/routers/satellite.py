from datetime import date
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database.connection import get_db
from app.models import CoastalZone, SatelliteImage
from app.schemas.satellite_image import SatelliteFetchRequest
from app.services.copernicus_service import search_sentinel2, fetch_product, CopernicusConfigurationError, CopernicusServiceError
from app.services.satellite_processing import process_geotiff

router = APIRouter(prefix="/api/satellite", tags=["Satellite Imagery"])


@router.get("/search", response_model=dict)
async def search(bbox: str = Query(..., description="west,south,east,north"), start_date: date = Query(...), end_date: date = Query(...), max_cloud: float = Query(30.0, ge=0, le=100), limit: int = Query(20, ge=1, le=100)):
    try:
        items = await search_sentinel2(bbox, start_date, end_date, max_cloud, limit)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except CopernicusServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc))
    return {"success": True, "data": {"items": items, "total": len(items), "source": "Copernicus Data Space Ecosystem STAC", "notice": "Asset availability and download authorization depend on Copernicus product access rules."}, "error": None}


@router.post("/fetch", response_model=dict, status_code=201)
async def fetch(payload: SatelliteFetchRequest, db: Session = Depends(get_db)):
    zone = db.get(CoastalZone, payload.coastal_zone_id)
    if not zone:
        raise HTTPException(status_code=404, detail="Coastal zone not found")
    existing = db.query(SatelliteImage).filter(SatelliteImage.image_url == payload.product_id).first()
    if existing:
        return {"success": True, "data": {"id": existing.image_id, "image_path": existing.image_url, "status": "already_stored"}, "error": None}
    destination = Path("storage/satellite") / f"{payload.product_id.replace('/', '_')}.zip"
    destination.parent.mkdir(parents=True, exist_ok=True)
    try:
        path = await fetch_product(payload.product_id, str(destination))
    except CopernicusConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception:
        raise HTTPException(status_code=502, detail="Copernicus product retrieval failed")
    from datetime import datetime
    image = SatelliteImage(zone_id=zone.zone_id, image_date=date.today(), image_source="Sentinel-2 Level-2A", image_url=path)
    db.add(image)
    db.commit()
    db.refresh(image)
    return {"success": True, "data": {"id": image.image_id, "image_path": path, "status": "downloaded"}, "error": None}


@router.get("/images", response_model=dict)
def list_images(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100), zone_id: int | None = None, db: Session = Depends(get_db)):
    query = db.query(SatelliteImage)
    if zone_id:
        query = query.filter(SatelliteImage.zone_id == zone_id)
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    return {"success": True, "data": {"items": [{"id": i.image_id, "coastal_zone_id": i.zone_id, "satellite_name": i.image_source, "product_id": i.image_url, "acquisition_date": i.image_date, "cloud_percentage": None, "image_path": i.image_url, "thumbnail_path": None, "processing_status": "stored", "created_at": i.image_date} for i in items], "total": total, "page": page, "page_size": page_size}, "error": None}


@router.get("/images/{image_id}", response_model=dict)
def get_image(image_id: int, db: Session = Depends(get_db)):
    image = db.get(SatelliteImage, image_id)
    if not image:
        raise HTTPException(status_code=404, detail="Satellite image not found")
    return {"success": True, "data": {"id": image.image_id, "coastal_zone_id": image.zone_id, "satellite_name": image.image_source, "product_id": image.image_url, "acquisition_date": image.image_date, "cloud_percentage": None, "image_path": image.image_url, "thumbnail_path": None, "processing_status": "stored", "created_at": image.image_date}, "error": None}


@router.post("/process/{image_id}", response_model=dict)
def process_image(image_id: int, db: Session = Depends(get_db)):
    image = db.get(SatelliteImage, image_id)
    if not image or not image.image_url:
        raise HTTPException(status_code=404, detail="Satellite image or stored path not found")
    if not Path(image.image_url).exists():
        raise HTTPException(status_code=422, detail="The configured image_path does not exist. Supply an explicitly downloaded GeoTIFF.")
    try:
        metadata = process_geotiff(image.image_url, "storage/processed")
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return {"success": True, "data": {"image_id": image.image_id, "processing_status": "processed", **metadata, "notice": "Spectral visualizations are not confirmed debris detections."}, "error": None}
