from fastapi import APIRouter, Depends
from sqlalchemy import func, desc
from sqlalchemy.orm import Session
from app.database.connection import get_db
from app.models import CoastalZone, DebrisDetection

router = APIRouter(prefix="/api/analytics", tags=["Analytics"])


@router.get("/dashboard", response_model=dict)
def dashboard(db: Session = Depends(get_db)):
    zone_count = db.query(func.count(CoastalZone.zone_id)).scalar() or 0
    detection_count = db.query(func.count(DebrisDetection.detection_id)).scalar() or 0
    verified = 0
    experimental = detection_count
    return {"success": True, "data": {"coastal_zones": zone_count, "detections": detection_count, "verified_detections": verified, "experimental_candidates": experimental}, "error": None}


@router.get("/coastal-risk", response_model=dict)
def coastal_risk(db: Session = Depends(get_db)):
    rows = db.query(CoastalZone.zone_id, CoastalZone.zone_name, func.count(DebrisDetection.detection_id).label("detection_count")).join(DebrisDetection, DebrisDetection.zone_id == CoastalZone.zone_id, isouter=True).group_by(CoastalZone.zone_id, CoastalZone.zone_name).order_by(desc("detection_count")).all()
    return {"success": True, "data": {"items": [{"zone_id": r.zone_id, "zone_name": r.zone_name, "detection_count": r.detection_count, "risk_level": "high" if r.detection_count >= 50 else "medium" if r.detection_count >= 20 else "low"} for r in rows]}, "error": None}


@router.get("/detection-trends", response_model=dict)
def detection_trends(db: Session = Depends(get_db)):
    dialect = db.get_bind().dialect.name
    month_expr = func.strftime("%Y-%m-01", DebrisDetection.detected_at) if dialect == "sqlite" else func.date_trunc("month", DebrisDetection.detected_at)
    rows = db.query(month_expr.label("month"), func.count(DebrisDetection.detection_id).label("count")).group_by("month").order_by("month").all()
    return {"success": True, "data": {"items": [{"month": r.month, "count": r.count} for r in rows]}, "error": None}
