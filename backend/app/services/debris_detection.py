from pathlib import Path
import numpy as np

try:
    import cv2
    CV2_AVAILABLE = True
except Exception:
    CV2_AVAILABLE = False


class DebrisDetectionService:
    """Experimental baseline candidate detector. No confidence claim is made without real model weights."""

    def __init__(self, model_path: str | None = None):
        self.model_path = model_path
        self.model = None

    def load_model(self):
        if not self.model_path:
            return False
        path = Path(self.model_path)
        if not path.exists():
            raise FileNotFoundError("Configured debris model weights were not found")
        # Framework-specific loading is intentionally isolated here for future trained models.
        return False

    def find_candidates(self, image_path: str, max_candidates: int = 50) -> list[dict]:
        if not CV2_AVAILABLE:
            return []
        image = cv2.imread(image_path)
        if image is None:
            raise ValueError("Unable to read processed image")
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        blur = cv2.GaussianBlur(gray, (9, 9), 0)
        _, threshold = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        contours, _ = cv2.findContours(threshold, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        candidates = []
        height, width = gray.shape
        for contour in contours:
            area = float(cv2.contourArea(contour))
            if area < 20:
                continue
            x, y, w, h = cv2.boundingRect(contour)
            cx = (x + w / 2) / width
            cy = (y + h / 2) / height
            candidates.append({
                "category": "Unclassified candidate",
                "confidence_score": None,
                "detection_status": "experimental_candidate",
                "relative_x": cx,
                "relative_y": cy,
                "area_estimate_pixels": area,
                "verification_status": "needs_field_check",
            })
            if len(candidates) >= max_candidates:
                break
        return candidates
