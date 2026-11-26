from datetime import datetime
from sqlalchemy import String, Float, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database.base import Base


class DebrisDetection(Base):
    __tablename__ = "debris_detections"

    detection_id: Mapped[int] = mapped_column(primary_key=True)
    zone_id: Mapped[int] = mapped_column(ForeignKey("coastal_zones.zone_id", ondelete="CASCADE"), index=True, nullable=False)
    debris_type: Mapped[str] = mapped_column(String(100), nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    detected_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    coastal_zone: Mapped["CoastalZone"] = relationship(back_populates="detections")
    drift_forecasts: Mapped[list["DriftForecast"]] = relationship(back_populates="detection", cascade="all, delete")
