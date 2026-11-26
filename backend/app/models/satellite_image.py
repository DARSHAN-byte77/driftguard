from datetime import date
from sqlalchemy import String, Text, Date, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database.base import Base


class SatelliteImage(Base):
    __tablename__ = "satellite_images"

    image_id: Mapped[int] = mapped_column(primary_key=True)
    zone_id: Mapped[int] = mapped_column(ForeignKey("coastal_zones.zone_id", ondelete="CASCADE"), index=True, nullable=False)
    image_date: Mapped[date] = mapped_column(Date, nullable=False)
    image_source: Mapped[str] = mapped_column(String(100), nullable=False)
    image_url: Mapped[str] = mapped_column(Text, nullable=False)

    coastal_zone: Mapped["CoastalZone"] = relationship(back_populates="satellite_images")
