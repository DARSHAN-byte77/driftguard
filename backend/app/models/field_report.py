from datetime import datetime, timezone
from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.database.base import Base


class FieldReport(Base):
    """User-submitted geotagged debris report with photo and observation metadata."""

    __tablename__ = "field_reports"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    reporter_name: Mapped[str] = mapped_column(String(120), nullable=False)
    reporter_email: Mapped[str] = mapped_column(String(255), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    debris_type: Mapped[str] = mapped_column(String(100), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False, default="medium")
    estimated_quantity: Mapped[str | None] = mapped_column(String(100), nullable=True)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    location_label: Mapped[str | None] = mapped_column(String(200), nullable=True)
    captured_at: Mapped[str | None] = mapped_column(String(64), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    gps_source: Mapped[str] = mapped_column(String(30), nullable=False, default="manual")
    exif_metadata_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    observed_direction_deg: Mapped[float | None] = mapped_column(Float, nullable=True)
    observed_direction_label: Mapped[str | None] = mapped_column(String(30), nullable=True)
    image_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="reported")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
