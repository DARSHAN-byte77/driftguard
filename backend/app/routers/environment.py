import math
import asyncio
import httpx
from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/api/environment", tags=["Met-Ocean Environment"])

WEATHER_URL = "https://api.open-meteo.com/v1/forecast"
MARINE_URL = "https://marine-api.open-meteo.com/v1/marine"
WIND_LEEWAY_FACTOR = 0.03

COMPASS_POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]


def deg_to_compass(deg: float | None) -> str | None:
    if deg is None or math.isnan(deg):
        return None
    idx = int((deg % 360.0) / 22.5 + 0.5) % 16
    return COMPASS_POINTS[idx]


def bearing_to_uv(speed: float, bearing_deg: float) -> tuple[float, float]:
    rad = math.radians(bearing_deg)
    return speed * math.sin(rad), speed * math.cos(rad)


@router.get("/surface-vector", response_model=dict)
async def get_surface_vector(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
):
    """Fetch live Open-Meteo wind & ocean current data and estimate instantaneous surface drift direction."""
    weather_params = {
        "latitude": lat,
        "longitude": lng,
        "current": "wind_speed_10m,wind_direction_10m",
        "wind_speed_unit": "ms",
    }
    marine_params = {
        "latitude": lat,
        "longitude": lng,
        "current": "ocean_current_velocity,ocean_current_direction,wave_height,wave_direction",
    }

    try:
        async with httpx.AsyncClient(timeout=12) as client:
            weather_res, marine_res = await asyncio.gather(
                client.get(WEATHER_URL, params=weather_params),
                client.get(MARINE_URL, params=marine_params),
            )
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail=f"Could not reach Open-Meteo API: {exc}") from exc

    if weather_res.status_code >= 400 and marine_res.status_code >= 400:
        raise HTTPException(status_code=502, detail="Open-Meteo environment services returned an error")

    weather_current = weather_res.json().get("current", {}) if weather_res.status_code == 200 else {}
    marine_current = marine_res.json().get("current", {}) if marine_res.status_code == 200 else {}

    wind_speed = weather_current.get("wind_speed_10m")
    wind_from_deg = weather_current.get("wind_direction_10m")
    wind_toward_deg = (float(wind_from_deg) + 180.0) % 360.0 if wind_from_deg is not None else None

    current_speed = marine_current.get("ocean_current_velocity")
    current_deg = marine_current.get("ocean_current_direction")
    wave_height = marine_current.get("wave_height")
    wave_deg = marine_current.get("wave_direction")

    if wind_speed is None and current_speed is None:
        raise HTTPException(status_code=503, detail="No live met-ocean data available at this coordinate")

    u_total = 0.0
    v_total = 0.0
    if current_speed is not None and current_deg is not None:
        uc, vc = bearing_to_uv(float(current_speed), float(current_deg))
        u_total += uc
        v_total += vc
    if wind_speed is not None and wind_toward_deg is not None:
        uw, vw = bearing_to_uv(float(wind_speed) * WIND_LEEWAY_FACTOR, wind_toward_deg)
        u_total += uw
        v_total += vw

    drift_speed_ms = round(math.hypot(u_total, v_total), 3)
    drift_deg = round((math.degrees(math.atan2(u_total, v_total)) + 360.0) % 360.0, 1) if drift_speed_ms > 0 else None

    if u_total > 0.02:
        tendency = "Onshore (toward Karnataka coast)"
    elif u_total < -0.02:
        tendency = "Offshore (toward Arabian Sea)"
    else:
        tendency = "Alongshore (parallel to coast)"

    return {
        "success": True,
        "data": {
            "latitude": lat,
            "longitude": lng,
            "source": "Open-Meteo Weather & Marine APIs",
            "observed_time": marine_current.get("time") or weather_current.get("time"),
            "wind_speed_ms": wind_speed,
            "wind_from_deg": wind_from_deg,
            "wind_toward_deg": round(wind_toward_deg, 1) if wind_toward_deg is not None else None,
            "wind_toward_compass": deg_to_compass(wind_toward_deg),
            "ocean_current_speed_ms": current_speed,
            "ocean_current_deg": current_deg,
            "ocean_current_compass": deg_to_compass(float(current_deg)) if current_deg is not None else None,
            "wave_height_m": wave_height,
            "wave_from_deg": wave_deg,
            "leeway_factor": WIND_LEEWAY_FACTOR,
            "estimated_drift_speed_ms": drift_speed_ms,
            "estimated_drift_speed_kmh": round(drift_speed_ms * 3.6, 2),
            "estimated_drift_direction_deg": drift_deg,
            "estimated_drift_compass": deg_to_compass(drift_deg),
            "coastal_tendency": tendency,
            "notice": "Instantaneous surface transport estimate (current + 3% wind leeway). Multi-day trajectory forecasting is Planned (Phase 2).",
        },
        "error": None,
    }
