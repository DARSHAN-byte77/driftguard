from datetime import date
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models import CleanupRecord, DebrisDetection


def generate_cleanup_report(db: Session, zone_id: int, title: str | None = None) -> CleanupRecord:
    count = db.query(func.count(DebrisDetection.detection_id)).filter(DebrisDetection.zone_id == zone_id).scalar() or 0
    if count >= 50:
        status = "critical"
    elif count >= 20:
        status = "high"
    elif count >= 5:
        status = "medium"
    else:
        status = "planned"
    report = CleanupRecord(zone_id=zone_id, cleanup_status=status, cleanup_date=date.today(), waste_collected_kg=0.0)
    db.add(report)
    db.commit()
    db.refresh(report)
    return report
