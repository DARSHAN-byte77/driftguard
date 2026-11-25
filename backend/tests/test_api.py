import pytest


def test_health(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["data"]["status"] == "ok"


def test_register_login_and_me(client):
    register = client.post("/api/auth/register", json={"name": "Test Analyst", "email": "analyst@example.com", "password": "securepass123", "role": "analyst"})
    assert register.status_code in (201, 409)
    login = client.post("/api/auth/login", json={"email": "analyst@example.com", "password": "securepass123"})
    assert login.status_code == 200
    token = login.json()["access_token"]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200


def test_invalid_login(client):
    response = client.post("/api/auth/login", json={"email": "nobody@example.com", "password": "wrongpassword"})
    assert response.status_code == 401


def test_zones_empty(client):
    response = client.get("/api/zones")
    assert response.status_code == 200
    assert response.json()["success"] is True


def test_create_coastal_zone(client):
    response = client.post("/api/zones", json={"zone_name":"Test Coastal Zone","state":"Test State","country":"India","description":"A zone for testing purposes","boundary_geojson":{"type":"Polygon","coordinates":[[[80.0,12.0],[81.0,12.0],[81.0,13.0],[80.0,13.0],[80.0,12.0]]]}})
    assert response.status_code in (201, 422)


def test_get_coastal_zones(client):
    response = client.get("/api/zones?page=1&page_size=20")
    assert response.status_code == 200
    assert "items" in response.json()["data"]


def test_satellite_search_validation(client):
    response = client.get("/api/satellite/search", params={"bbox": "bad", "start_date": "2026-01-01", "end_date": "2026-01-31"})
    assert response.status_code in (422, 502)


def test_detection_retrieval_empty(client):
    response = client.get("/api/detections")
    assert response.status_code == 200


def test_analytics(client):
    response = client.get("/api/analytics/dashboard")
    assert response.status_code == 200


def test_reports(client):
    response = client.get("/api/reports")
    assert response.status_code == 200
