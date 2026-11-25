from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database.connection import get_db
from app.models import CleanupRecord, CoastalZone
from app.schemas.report import ReportGenerateRequest
from app.services.report_service import generate_cleanup_report

router = APIRouter(prefix="/api/reports", tags=["Cleanup Reports"])


def serialize(report: CleanupRecord) -> dict:
    return {"id": report.cleanup_id, "coastal_zone_id": report.zone_id, "report_title": "MarineWatch Cleanup Record", "priority_level": "medium", "detection_count": 0, "recommendations": "Review and verify cleanup progress.", "report_status": report.cleanup_status, "created_at": report.cleanup_date}


@router.post("/generate", response_model=dict, status_code=201)
def generate(payload: ReportGenerateRequest, db: Session = Depends(get_db)):
    if not db.get(CoastalZone, payload.coastal_zone_id):
        raise HTTPException(status_code=404, detail="Coastal zone not found")
    report = generate_cleanup_report(db, payload.coastal_zone_id, payload.report_title)
    return {"success": True, "data": serialize(report), "error": None}


@router.get("", response_model=dict)
def list_reports(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100), zone_id: int | None = None, db: Session = Depends(get_db)):
    query = db.query(CleanupRecord)
    if zone_id:
        query = query.filter(CleanupRecord.zone_id == zone_id)
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    return {"success": True, "data": {"items": [serialize(r) for r in items], "total": total, "page": page, "page_size": page_size}, "error": None}


@router.get("/{report_id}", response_model=dict)
def get_report(report_id: int, db: Session = Depends(get_db)):
    report = db.get(CleanupRecord, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Cleanup report not found")
    return {"success": True, "data": serialize(report), "error": None}
