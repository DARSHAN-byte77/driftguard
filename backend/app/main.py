from contextlib import asynccontextmanager
import logging
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from app.config import get_settings
from app.database.connection import engine
from app.database.base import Base
from app import models
from app.routers.auth import router as auth_router
from app.routers.zones import router as zones_router
from app.routers.satellite import router as satellite_router
from app.routers.detections import router as detections_router
from app.routers.analytics import router as analytics_router
from app.routers.reports import router as reports_router
from app.routers.field_reports import router as field_reports_router
from app.routers.environment import router as environment_router

settings = get_settings()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("marinewatch")

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
CLIENT_DIR = REPO_ROOT / "client"
CLIENT_DIST = CLIENT_DIR / "dist"
CLIENT_PUBLIC_DATA = CLIENT_DIR / "public" / "data"


@asynccontextmanager
async def lifespan(_: FastAPI):
    if engine.dialect.name == "sqlite":
        Base.metadata.create_all(bind=engine)
        with engine.begin() as connection:
            cols = {row[1] for row in connection.execute(text("PRAGMA table_info(field_reports)"))}
            if "observed_direction_deg" not in cols:
                connection.execute(text("ALTER TABLE field_reports ADD COLUMN observed_direction_deg FLOAT"))
            if "observed_direction_label" not in cols:
                connection.execute(text("ALTER TABLE field_reports ADD COLUMN observed_direction_label VARCHAR(30)"))
    yield


app = FastAPI(title=settings.app_name, version="1.0.0", docs_url="/docs", redoc_url="/redoc", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origin_list, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error: %s %s", request.method, request.url)
    return JSONResponse(status_code=500, content={"success": False, "error": {"code": "INTERNAL_ERROR", "message": "An internal server error occurred"}})


@app.get("/api/health")
def health():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        database = "connected"
    except Exception:
        database = "unavailable"
    return {"success": True, "data": {"status": "ok", "database": database, "service": settings.app_name}, "error": None}

app.include_router(auth_router)
app.include_router(zones_router)
app.include_router(satellite_router)
app.include_router(detections_router)
app.include_router(analytics_router)
app.include_router(reports_router)
app.include_router(field_reports_router)
app.include_router(environment_router)


@app.get("/data/{file_path:path}", include_in_schema=False)
def serve_screening_data(file_path: str):
    data_root = CLIENT_PUBLIC_DATA if CLIENT_PUBLIC_DATA.is_dir() else (CLIENT_DIST / "data")
    if not data_root.is_dir():
        raise HTTPException(status_code=404, detail="Data directory not found")
    target = (data_root / file_path).resolve()
    if not target.is_relative_to(data_root.resolve()) or not target.is_file():
        raise HTTPException(status_code=404, detail="Data file not found")
    return FileResponse(target)


if (CLIENT_DIST / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=str(CLIENT_DIST / "assets")), name="frontend-assets")


@app.get("/{full_path:path}", include_in_schema=False)
def serve_frontend(full_path: str):
    if full_path.startswith("api/") or full_path == "api":
        raise HTTPException(status_code=404, detail="Not found")
    index_file = CLIENT_DIST / "index.html"
    if not index_file.is_file():
        raise HTTPException(status_code=404, detail="Frontend build not found. Run npm run build in client/.")
    if full_path:
        candidate = (CLIENT_DIST / full_path).resolve()
        if candidate.is_relative_to(CLIENT_DIST.resolve()) and candidate.is_file():
            return FileResponse(candidate)
    return FileResponse(index_file)
