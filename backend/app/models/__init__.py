from app.models.user import User
from app.models.coastal_zone import CoastalZone
from app.models.satellite_image import SatelliteImage
from app.models.debris_detection import DebrisDetection
from app.models.cleanup_report import CleanupRecord
from app.models.drift_forecast import DriftForecast

__all__ = ["User", "CoastalZone", "SatelliteImage", "DebrisDetection", "CleanupRecord", "DriftForecast"]
