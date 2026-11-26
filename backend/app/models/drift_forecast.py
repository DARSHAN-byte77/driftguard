from datetime import datetime
from sqlalchemy import Integer, Float, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database.base import Base


class DriftForecast(Base):
    __tablename__ = "drift_forecasts"

    forecast_id: Mapped[int] = mapped_column(primary_key=True)
    detection_id: Mapped[int] = mapped_column(ForeignKey("debris_detections.detection_id", ondelete="CASCADE"), index=True, nullable=False)
    predicted_latitude: Mapped[float] = mapped_column(Float, nullable=False)
    predicted_longitude: Mapped[float] = mapped_column(Float, nullable=False)
    forecast_time: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    detection: Mapped["DebrisDetection"] = relationship(back_populates="drift_forecasts")
