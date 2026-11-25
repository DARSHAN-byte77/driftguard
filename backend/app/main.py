import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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

settings = get_settings()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("marinewatch")

app = FastAPI(title=settings.app_name, version="1.0.0", docs_url="/docs", redoc_url="/redoc")
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
