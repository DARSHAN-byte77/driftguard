from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database.connection import get_db
from app.models import DebrisDetection, SatelliteImage, CoastalZone
from app.schemas.detection import DetectionCreate, VerificationUpdate

router = APIRouter(prefix="/api/detections", tags=["Debris Detections"])


def serialize(item: DebrisDetection) -> dict:
    return {"id": item.detection_id, "coastal_zone_id": item.zone_id, "debris_category": item.debris_type, "confidence_score": item.confidence, "detection_status": "experimental_candidate", "verification_status": "unverified", "latitude": item.latitude, "longitude": item.longitude, "area_estimate": None, "created_at": item.detected_at, "geojson": {"type": "Point", "coordinates": [item.longitude, item.latitude]}}


@router.get("", response_model=dict)
def list_detections(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100), zone_id: int | None = None, verification_status: str | None = None, category: str | None = None, db: Session = Depends(get_db)):
    if verification_status and verification_status != "unverified":
        return {"success": True, "data": {"items": [], "total": 0, "page": page, "page_size": page_size}, "error": None}
    query = db.query(DebrisDetection)
    if zone_id:
        query = query.filter(DebrisDetection.zone_id == zone_id)
    if category:
        query = query.filter(DebrisDetection.debris_type.ilike(f"%{category}%"))
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    return {"success": True, "data": {"items": [serialize(i) for i in items], "total": total, "page": page, "page_size": page_size}, "error": None}


@router.get("/{detection_id}", response_model=dict)
def get_detection(detection_id: int, db: Session = Depends(get_db)):
    item = db.get(DebrisDetection, detection_id)
    if not item:
        raise HTTPException(status_code=404, detail="Detection not found")
    return {"success": True, "data": serialize(item), "error": None}


@router.post("", response_model=dict, status_code=201)
def create_detection(payload: DetectionCreate, db: Session = Depends(get_db)):
    if not db.get(SatelliteImage, payload.satellite_image_id):
        raise HTTPException(status_code=404, detail="Satellite image not found")
    if not db.get(CoastalZone, payload.coastal_zone_id):
        raise HTTPException(status_code=404, detail="Coastal zone not found")
    item = DebrisDetection(zone_id=payload.coastal_zone_id, debris_type=payload.debris_category, latitude=payload.latitude, longitude=payload.longitude, confidence=payload.confidence_score or 0.0, detected_at=datetime.utcnow())
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"success": True, "data": serialize(item), "error": None}


@router.patch("/{detection_id}/verification", response_model=dict)
def update_verification(detection_id: int, payload: VerificationUpdate, db: Session = Depends(get_db)):
    item = db.get(DebrisDetection, detection_id)
    if not item:
        raise HTTPException(status_code=404, detail="Detection not found")
    data = serialize(item)
    data["verification_status"] = payload.verification_status
    data["verification_persisted"] = False
    return {"success": True, "data": data, "error": None}
