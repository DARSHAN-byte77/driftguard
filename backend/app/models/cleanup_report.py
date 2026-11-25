from datetime import date
from sqlalchemy import String, Integer, Date, Float, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database.base import Base


class CleanupRecord(Base):
    __tablename__ = "cleanup_records"

    cleanup_id: Mapped[int] = mapped_column(primary_key=True)
    zone_id: Mapped[int] = mapped_column(ForeignKey("coastal_zones.zone_id", ondelete="CASCADE"), index=True, nullable=False)
    cleanup_status: Mapped[str] = mapped_column(String(50), nullable=False)
    cleanup_date: Mapped[date] = mapped_column(Date, nullable=False)
    waste_collected_kg: Mapped[float] = mapped_column(Float, nullable=False)

    coastal_zone: Mapped["CoastalZone"] = relationship(back_populates="cleanup_records")
