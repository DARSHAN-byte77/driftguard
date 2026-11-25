import os
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

os.environ["DATABASE_URL"] = "sqlite:///./test_marinewatch.db"

from app.database.base import Base
from app.database.connection import get_db
from app import models
from app.main import app

engine = create_engine("sqlite:///./test_marinewatch.db", connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="session", autouse=True)
def prepare_database():
    if os.path.exists("test_marinewatch.db"):
        os.remove("test_marinewatch.db")
    for model in (models.User, models.SatelliteImage, models.CleanupRecord):
        model.__table__.create(bind=engine, checkfirst=True)
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE IF NOT EXISTS coastal_zones (zone_id INTEGER PRIMARY KEY, zone_name VARCHAR(150) NOT NULL, latitude FLOAT NOT NULL, longitude FLOAT NOT NULL, region VARCHAR(150))"))
        connection.execute(text("CREATE TABLE IF NOT EXISTS debris_detections (detection_id INTEGER PRIMARY KEY, zone_id INTEGER NOT NULL, debris_type VARCHAR(100) NOT NULL, latitude FLOAT NOT NULL, longitude FLOAT NOT NULL, confidence FLOAT NOT NULL, detected_at DATETIME NOT NULL)"))
    yield


@pytest.fixture
def db():
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


@pytest.fixture
def client(db):
    def override_db():
        yield db
    app.dependency_overrides[get_db] = override_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
