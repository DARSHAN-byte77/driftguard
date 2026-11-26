import json
from pathlib import Path
from uuid import uuid4
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import desc
from sqlalchemy.orm import Session
from app.database.connection import get_db
from app.models.field_report import FieldReport
from app.models.user import User
from app.routers.auth import get_current_user
from app.utils.exif_utils import extract_image_metadata

router = APIRouter(prefix="/api/field-reports", tags=["Field Reports"])

BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent
UPLOADS_DIR = BACKEND_ROOT / "storage" / "uploads"
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_IMAGE_BYTES = 15 * 1024 * 1024  # 15 MB
ALLOWED_STATUSES = {"reported", "under_review", "cleared"}
ALLOWED_SEVERITIES = {"low", "medium", "high"}
ORG_ROLES = {"organisation", "analyst", "admin"}


class FieldReportStatusUpdate(BaseModel):
    status: str = Field(pattern="^(reported|under_review|cleared)$")


def compute_report_confidence(report: FieldReport, exif_meta: dict) -> dict:
    """Deterministic evidence-completeness score (0-100) from real report attributes."""
    gps_source = (report.gps_source or "manual").lower()
    if gps_source == "exif":
        gps_pts = 30
    elif gps_source == "browser_gps":
        gps_pts = 22
    else:
        gps_pts = 12

    has_camera_or_exif_time = bool(
        exif_meta.get("camera_make") or exif_meta.get("camera_model") or exif_meta.get("captured_at")
    )
    image_pts = 20 if has_camera_or_exif_time else 10

    meta_pts = 0
    if report.location_label:
        meta_pts += 5
    if report.estimated_quantity:
        meta_pts += 5
    if report.notes:
        meta_pts += 5

    time_pts = 10 if report.captured_at else 0
    direction_pts = 10 if report.observed_direction_deg is not None else 0
    review_pts = 15 if report.status in {"under_review", "cleared"} else 10

    score = min(100, gps_pts + image_pts + meta_pts + time_pts + direction_pts + review_pts)
    tier = "High" if score >= 75 else "Moderate" if score >= 50 else "Low"

    return {
        "score": score,
        "tier": tier,
        "breakdown": [
            {"label": f"Geotag source ({gps_source})", "points": gps_pts, "max": 30},
            {"label": "Image & EXIF metadata", "points": image_pts, "max": 20},
            {"label": "Field metadata completeness", "points": meta_pts, "max": 15},
            {"label": "Capture timestamp", "points": time_pts, "max": 10},
            {"label": "Observed drift direction", "points": direction_pts, "max": 10},
            {"label": f"Review status ({report.status})", "points": review_pts, "max": 15},
        ],
    }


def serialize_report(report: FieldReport) -> dict:
    try:
        exif_meta = json.loads(report.exif_metadata_json) if report.exif_metadata_json else {}
    except json.JSONDecodeError:
        exif_meta = {}

    confidence = compute_report_confidence(report, exif_meta)

    return {
        "id": report.id,
        "user_id": report.user_id,
        "reporter_name": report.reporter_name,
        "reporter_email": report.reporter_email,
        "title": report.title,
        "debris_type": report.debris_type,
        "severity": report.severity,
        "estimated_quantity": report.estimated_quantity,
        "latitude": report.latitude,
        "longitude": report.longitude,
        "location_label": report.location_label,
        "captured_at": report.captured_at,
        "notes": report.notes,
        "gps_source": report.gps_source,
        "exif_metadata": exif_meta,
        "observed_direction_deg": report.observed_direction_deg,
        "observed_direction_label": report.observed_direction_label,
        "confidence_score": confidence["score"],
        "confidence_tier": confidence["tier"],
        "confidence_breakdown": confidence["breakdown"],
        "image_url": f"/api/field-reports/images/{report.image_filename}",
        "status": report.status,
        "created_at": report.created_at.isoformat() if report.created_at else None,
    }


@router.post("/extract-exif", response_model=dict)
async def preview_exif(
    photo: UploadFile = File(...),
    _: User = Depends(get_current_user),
):
    ext = Path(photo.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=422, detail="Supported image formats: JPG, JPEG, PNG, WEBP")
    raw = await photo.read()
    if len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds 15 MB limit")
    metadata = extract_image_metadata(raw, photo.filename)
    return {"success": True, "data": metadata, "error": None}


@router.post("", response_model=dict, status_code=201)
async def create_field_report(
    title: str | None = Form(None, max_length=200),
    debris_type: str | None = Form(None, max_length=100),
    severity: str = Form("medium"),
    estimated_quantity: str | None = Form(None),
    latitude: float | None = Form(None),
    longitude: float | None = Form(None),
    location_label: str | None = Form(None),
    captured_at: str | None = Form(None),
    notes: str | None = Form(None),
    gps_source: str = Form("manual"),
    observed_direction_deg: float | None = Form(None),
    observed_direction_label: str | None = Form(None),
    photo: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ext = Path(photo.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=422, detail="Supported image formats: JPG, JPEG, PNG, WEBP")

    raw = await photo.read()
    if not raw:
        raise HTTPException(status_code=422, detail="Uploaded image is empty")
    if len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds 15 MB limit")

    severity_clean = severity.strip().lower()
    if severity_clean not in ALLOWED_SEVERITIES:
        raise HTTPException(status_code=422, detail="Severity must be low, medium, or high")

    exif_meta = extract_image_metadata(raw, photo.filename)
    if exif_meta.get("format") is None:
        raise HTTPException(status_code=422, detail="Uploaded file is not a valid image")

    final_lat = latitude if latitude is not None else exif_meta.get("latitude")
    final_lng = longitude if longitude is not None else exif_meta.get("longitude")

    if final_lat is None or final_lng is None:
        raise HTTPException(
            status_code=422,
            detail="Latitude and longitude are required (either from photo EXIF GPS or entered manually)",
        )
    if not (-90 <= final_lat <= 90) or not (-180 <= final_lng <= 180):
        raise HTTPException(status_code=422, detail="Coordinates are outside valid WGS84 bounds")
    if observed_direction_deg is not None and not (0 <= observed_direction_deg <= 360):
        raise HTTPException(status_code=422, detail="Observed direction must be between 0 and 360 degrees")

    final_gps_source = gps_source.strip().lower() or "manual"
    if latitude is None and exif_meta.get("latitude") is not None:
        final_gps_source = "exif"

    final_captured_at = (captured_at or "").strip() or exif_meta.get("captured_at")
    final_location = (location_label or "").strip() or f"{final_lat:.4f}, {final_lng:.4f}"
    final_debris_type = (debris_type or "").strip() or "Suspected marine litter"
    final_title = (title or "").strip() or f"{final_debris_type} ({final_location})"

    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    stored_filename = f"{uuid4().hex}{ext}"
    (UPLOADS_DIR / stored_filename).write_bytes(raw)

    report = FieldReport(
        user_id=current_user.id,
        reporter_name=current_user.name,
        reporter_email=current_user.email,
        title=final_title,
        debris_type=final_debris_type,
        severity=severity_clean,
        estimated_quantity=estimated_quantity.strip() if estimated_quantity else None,
        latitude=float(final_lat),
        longitude=float(final_lng),
        location_label=final_location,
        captured_at=final_captured_at,
        notes=notes.strip() if notes else None,
        gps_source=final_gps_source,
        exif_metadata_json=json.dumps(exif_meta),
        observed_direction_deg=float(observed_direction_deg) if observed_direction_deg is not None else None,
        observed_direction_label=observed_direction_label.strip() if observed_direction_label else None,
        image_filename=stored_filename,
        status="reported",
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    return {"success": True, "data": serialize_report(report), "error": None}


@router.get("", response_model=dict)
def list_field_reports(
    status: str | None = Query(None),
    debris_type: str | None = Query(None),
    search: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    all_rows = db.query(FieldReport).order_by(desc(FieldReport.created_at), desc(FieldReport.id)).all()

    status_counts = {"reported": 0, "under_review": 0, "cleared": 0}
    category_counts: dict[str, int] = {}
    for row in all_rows:
        status_counts[row.status] = status_counts.get(row.status, 0) + 1
        category_counts[row.debris_type] = category_counts.get(row.debris_type, 0) + 1

    filtered = all_rows
    if status and status != "all":
        filtered = [r for r in filtered if r.status == status]
    if debris_type and debris_type != "all":
        filtered = [r for r in filtered if r.debris_type.lower() == debris_type.lower()]
    if search and search.strip():
        needle = search.strip().lower()
        filtered = [
            r
            for r in filtered
            if needle in r.title.lower()
            or needle in r.debris_type.lower()
            or needle in r.reporter_name.lower()
            or needle in (r.location_label or "").lower()
            or needle in (r.notes or "").lower()
        ]

    return {
        "success": True,
        "data": {
            "total_reported": len(all_rows),
            "filtered_count": len(filtered),
            "status_counts": status_counts,
            "category_counts": category_counts,
            "viewer_role": current_user.role,
            "items": [serialize_report(r) for r in filtered],
        },
        "error": None,
    }


@router.patch("/{report_id}/status", response_model=dict)
def update_report_status(
    report_id: int,
    payload: FieldReportStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role not in ORG_ROLES:
        raise HTTPException(
            status_code=403,
            detail="Only organisation, analyst, or admin accounts can update report status",
        )
    report = db.get(FieldReport, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Field report not found")
    if payload.status not in ALLOWED_STATUSES:
        raise HTTPException(status_code=422, detail="Invalid report status")

    report.status = payload.status
    db.commit()
    db.refresh(report)
    return {"success": True, "data": serialize_report(report), "error": None}


@router.get("/images/{filename}", include_in_schema=False)
def get_report_image(filename: str):
    if not UPLOADS_DIR.is_dir():
        raise HTTPException(status_code=404, detail="Image not found")
    target = (UPLOADS_DIR / filename).resolve()
    if not target.is_relative_to(UPLOADS_DIR.resolve()) or not target.is_file():
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(target)
