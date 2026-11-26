import httpx
from datetime import date
from app.config import get_settings

settings = get_settings()


class CopernicusConfigurationError(RuntimeError):
    pass


class CopernicusServiceError(RuntimeError):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


async def search_sentinel2(bbox: str, start_date: date | str, end_date: date | str, max_cloud: float = 30.0, limit: int = 20) -> list[dict]:
    if isinstance(start_date, str):
        start_date = date.fromisoformat(start_date)
    if isinstance(end_date, str):
        end_date = date.fromisoformat(end_date)
    try:
        parts = [float(value.strip()) for value in bbox.split(",")]
    except (TypeError, ValueError) as exc:
        raise ValueError("bbox must contain four numeric values: west,south,east,north") from exc
    if len(parts) != 4:
        raise ValueError("bbox must contain exactly four values: west,south,east,north")
    west, south, east, north = parts
    if not (-180 <= west <= 180 and -180 <= east <= 180 and -90 <= south <= 90 and -90 <= north <= 90):
        raise ValueError("Bounding box coordinates are outside valid WGS84 ranges")
    if west >= east or south >= north:
        raise ValueError("Invalid bounding box: west must be below east and south below north")
    if end_date < start_date:
        raise ValueError("end_date must be on or after start_date")
    if not (0 <= max_cloud <= 100):
        raise ValueError("max_cloud must be between 0 and 100")

    payload = {
        "collections": ["sentinel-2-l2a"],
        "bbox": [west, south, east, north],
        "datetime": f"{start_date.isoformat()}T00:00:00Z/{end_date.isoformat()}T23:59:59Z",
        "limit": min(max(limit, 1), 100),
        "query": {"eo:cloud_cover": {"lte": max_cloud}},
        "sortby": [{"field": "properties.datetime", "direction": "desc"}],
    }

    try:
        async with httpx.AsyncClient(timeout=45) as client:
            response = await client.post(f"{settings.copernicus_stac_url.rstrip('/')}/search", json=payload)
            if response.status_code >= 400:
                raise CopernicusServiceError(f"Copernicus STAC search failed with HTTP {response.status_code}", status_code=502)
            document = response.json()
    except httpx.TimeoutException as exc:
        raise CopernicusServiceError("Copernicus STAC search timed out", status_code=504) from exc
    except httpx.RequestError as exc:
        raise CopernicusServiceError("Could not reach Copernicus STAC", status_code=502) from exc

    results = []
    for item in document.get("features", []):
        properties = item.get("properties") or {}
        assets = item.get("assets") or {}
        cloud_value = properties.get("eo:cloud_cover")
        try:
            cloud_value = float(cloud_value) if cloud_value is not None else None
        except (TypeError, ValueError):
            cloud_value = None

        asset_references = {}
        for name, asset in assets.items():
            href = asset.get("href") if isinstance(asset, dict) else None
            if href:
                asset_references[name] = {
                    "href": href,
                    "type": asset.get("type"),
                    "title": asset.get("title"),
                    "roles": asset.get("roles", []),
                }

        download_asset = None
        for name, asset in asset_references.items():
            roles = {str(role).lower() for role in asset.get("roles", [])}
            if name.lower() in {"product", "download", "data"} or roles.intersection({"data", "download", "archive"}):
                download_asset = asset
                break
        thumbnail_asset = asset_references.get("thumbnail")
        if not thumbnail_asset:
            thumbnail_asset = next((asset for asset in asset_references.values() if "thumbnail" in str(asset.get("title", "")).lower()), None)

        results.append({
            "product_id": item.get("id"),
            "title": properties.get("title") or item.get("id"),
            "acquisition_date": properties.get("datetime") or properties.get("start_datetime"),
            "cloud_percentage": cloud_value,
            "satellite_name": "Sentinel-2 Level-2A",
            "collection": item.get("collection"),
            "bbox": item.get("bbox"),
            "geometry": item.get("geometry"),
            "assets": asset_references,
            "thumbnail_url": thumbnail_asset.get("href") if thumbnail_asset else None,
            "download_url": download_asset.get("href") if download_asset else None,
        })
    return results


async def fetch_product(product_id: str, destination: str) -> str:
    if not settings.copernicus_client_id or not settings.copernicus_client_secret:
        raise CopernicusConfigurationError("Copernicus credentials are not configured. Set COPERNICUS_CLIENT_ID and COPERNICUS_CLIENT_SECRET.")
    async with httpx.AsyncClient(timeout=60) as client:
        token_response = await client.post(settings.copernicus_token_url, data={"grant_type": "client_credentials", "client_id": settings.copernicus_client_id, "client_secret": settings.copernicus_client_secret})
        token_response.raise_for_status()
        token = token_response.json()["access_token"]
        download_response = await client.get(f"{settings.copernicus_catalog_url}/Products({product_id})/$value", headers={"Authorization": f"Bearer {token}"}, follow_redirects=True)
        download_response.raise_for_status()
        with open(destination, "wb") as output:
            output.write(download_response.content)
    return destination
