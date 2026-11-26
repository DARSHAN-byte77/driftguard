# MarineWatch Backend

MarineWatch provides REST APIs for coastal-zone management, Sentinel-2 metadata and retrieval, raster processing, experimental debris candidate analysis, spatial detections, analytics, authentication and cleanup reports. It does not claim to detect individual plastic objects. Sentinel-2 Level-2A data has 10 m resolution at best and all candidate output is experimental/unverified until field or trained-model validation.

## Stack

- Python 3.12
- FastAPI and Uvicorn
- PostgreSQL/PostGIS, SQLAlchemy, GeoAlchemy2, Psycopg
- Rasterio, GeoPandas, Shapely, NumPy, OpenCV, Pillow
- HTTPX for Copernicus APIs
- Pydantic and JWT/passlib
- Alembic and Pytest

## Windows setup

```powershell
cd "C:\Users\HARSHINI T A\OneDrive\Desktop\marine watch\backend"
py -3.12 -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env
```

## PostgreSQL and PostGIS

Install PostgreSQL and the matching PostGIS extension. In `psql`:

```sql
CREATE DATABASE marinewatch;
\c marinewatch
CREATE EXTENSION IF NOT EXISTS postgis;
```

Set `DATABASE_URL` in `.env`, for example:

```text
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/marinewatch
JWT_SECRET=replace-with-a-random-secret
CORS_ORIGINS=http://localhost:5173
```

Run migrations:

```powershell
alembic upgrade head
```

## Run

```powershell
python run.py
```

Open `http://localhost:8000/docs` for Swagger or `http://localhost:8000/redoc`.

Health endpoint: `GET /api/health`.

## Copernicus configuration

Create OAuth credentials in the Copernicus Data Space Ecosystem and set:

```text
COPERNICUS_CLIENT_ID=...
COPERNICUS_CLIENT_SECRET=...
```

Search is sent to the official OData catalogue. Retrieval uses the official OAuth2 client-credentials flow and downloads a selected product.

No credentials: `/api/satellite/fetch` returns HTTP 503 and does not invent product IDs or URLs. Supply an explicitly downloaded Sentinel-2 Level-2A GeoTIFF through the storage path for processing; commercial or archive download authorization remains your responsibility.

## Raster processing

A GeoTIFF can be registered in `SATELLITE_IMAGES.image_path` and processed through `POST /api/satellite/process/{image_id}`. The processor exports true-colour B4/B3/B2, false-colour B8/B4/B3 and NDWI B3/B8 when bands are available and aligned. These are visualizations/indices, not confirmed debris detections.

Future trained model weights can be configured by extending `DebrisDetectionService.load_model()`. With no model, candidate extraction uses transparent OpenCV contours and returns no confidence score. Every baseline result is `experimental_candidate` and `needs_field_check`.

## Tests

```powershell
python -m pytest -q
```

Tests use a mock/SQLite environment and do not require live Copernicus credentials.

## React integration

CORS is configured for `http://localhost:5173`. Leaflet can consume detection `latitude`, `longitude`, `geojson`, `acquisition_date`, category and verification fields.
