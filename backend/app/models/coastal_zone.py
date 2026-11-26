from sqlalchemy import String, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database.base import Base


class CoastalZone(Base):
    __tablename__ = "coastal_zones"

    zone_id: Mapped[int] = mapped_column(primary_key=True)
    zone_name: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    region: Mapped[str | None] = mapped_column(String(150), nullable=True)

    satellite_images: Mapped[list["SatelliteImage"]] = relationship(back_populates="coastal_zone", cascade="all, delete")
    detections: Mapped[list["DebrisDetection"]] = relationship(back_populates="coastal_zone", cascade="all, delete")
    cleanup_records: Mapped[list["CleanupRecord"]] = relationship(back_populates="coastal_zone", cascade="all, delete")
