from io import BytesIO
from PIL import ExifTags, Image


def _to_float(value) -> float | None:
    try:
        if hasattr(value, "numerator") and hasattr(value, "denominator"):
            return float(value.numerator) / float(value.denominator) if value.denominator else None
        if isinstance(value, tuple) and len(value) == 2:
            return float(value[0]) / float(value[1]) if value[1] else None
        return float(value)
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def _dms_to_decimal(dms, ref: str | None) -> float | None:
    if not isinstance(dms, (list, tuple)) or len(dms) < 3:
        return None
    deg = _to_float(dms[0])
    minutes = _to_float(dms[1])
    seconds = _to_float(dms[2])
    if deg is None or minutes is None or seconds is None:
        return None
    decimal = deg + (minutes / 60.0) + (seconds / 3600.0)
    if ref and str(ref).upper() in {"S", "W"}:
        decimal = -abs(decimal)
    return round(decimal, 6)


def extract_image_metadata(raw_bytes: bytes, filename: str | None = None) -> dict:
    """Extract image dimensions, EXIF camera/time fields, and GPS coordinates if present."""
    info: dict = {
        "filename": filename,
        "size_bytes": len(raw_bytes),
        "width": None,
        "height": None,
        "format": None,
        "camera_make": None,
        "camera_model": None,
        "software": None,
        "altitude_m": None,
        "captured_at": None,
        "latitude": None,
        "longitude": None,
    }

    try:
        with Image.open(BytesIO(raw_bytes)) as img:
            info["width"], info["height"] = img.size
            info["format"] = img.format

            exif = img.getexif()
            if not exif:
                return info

            tag_map = {ExifTags.TAGS.get(k, k): v for k, v in exif.items()}
            if tag_map.get("Make"):
                info["camera_make"] = str(tag_map["Make"]).strip("\x00 ").strip()
            if tag_map.get("Model"):
                info["camera_model"] = str(tag_map["Model"]).strip("\x00 ").strip()
            if tag_map.get("Software"):
                info["software"] = str(tag_map["Software"]).strip("\x00 ").strip()

            raw_dt = tag_map.get("DateTimeOriginal") or tag_map.get("DateTimeDigitized") or tag_map.get("DateTime")
            if raw_dt:
                dt_str = str(raw_dt).strip("\x00 ").strip()
                # Convert EXIF "YYYY:MM:DD HH:MM:SS" to ISO-like "YYYY-MM-DDTHH:MM:SS"
                if len(dt_str) >= 19 and dt_str[4] == ":" and dt_str[7] == ":":
                    dt_str = f"{dt_str[:4]}-{dt_str[5:7]}-{dt_str[8:10]}T{dt_str[11:19]}"
                info["captured_at"] = dt_str

            gps_ifd = exif.get_ifd(ExifTags.IFD.GPSInfo) if hasattr(ExifTags, "IFD") else None
            if gps_ifd:
                gps_tags = {ExifTags.GPSTAGS.get(k, k): v for k, v in gps_ifd.items()}
                lat = _dms_to_decimal(gps_tags.get("GPSLatitude"), gps_tags.get("GPSLatitudeRef"))
                lng = _dms_to_decimal(gps_tags.get("GPSLongitude"), gps_tags.get("GPSLongitudeRef"))
                if lat is not None and lng is not None and -90 <= lat <= 90 and -180 <= lng <= 180:
                    info["latitude"] = lat
                    info["longitude"] = lng
                alt = _to_float(gps_tags.get("GPSAltitude"))
                if alt is not None:
                    info["altitude_m"] = round(alt, 1)
    except Exception:
        return info

    return info
