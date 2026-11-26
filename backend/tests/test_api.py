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
    response = client.get("/api/detections?category=plastic&verification_status=unverified")
    assert response.status_code == 200


def test_analytics(client):
    response = client.get("/api/analytics/dashboard")
    assert response.status_code == 200
    trends = client.get("/api/analytics/detection-trends")
    assert trends.status_code == 200


def test_reports(client):
    response = client.get("/api/reports")
    assert response.status_code == 200


def test_unified_frontend_and_data_routes(client):
    home = client.get("/")
    assert home.status_code == 200
    assert "DriftGuard" in home.text

    meta = client.get("/data/metadata.json")
    assert meta.status_code == 200
    assert "source" in meta.json()

    missing = client.get("/data/does_not_exist.geojson")
    assert missing.status_code == 404


def test_field_report_upload_exif_and_org_portal(client):
    from io import BytesIO
    from pathlib import Path
    from PIL import Image
    from PIL.TiffImagePlugin import IFDRational

    # Register and login as a field reporter
    client.post("/api/auth/register", json={"name": "Coastal Reporter", "email": "reporter@example.com", "password": "securepass123", "role": "reporter"})
    rep_login = client.post("/api/auth/login", json={"email": "reporter@example.com", "password": "securepass123"})
    assert rep_login.status_code == 200
    rep_headers = {"Authorization": f"Bearer {rep_login.json()['access_token']}"}

    # Build a small test JPEG with EXIF GPS tags (Malpe ~13.3500 N, 74.7000 E)
    img = Image.new("RGB", (32, 32), color=(20, 120, 160))
    exif = img.getexif()
    exif[271] = "TestCam"
    exif[306] = "2026:11:25 10:15:00"
    exif[0x8825] = {
        1: "N",
        2: (IFDRational(13, 1), IFDRational(21, 1), IFDRational(0, 1)),
        3: "E",
        4: (IFDRational(74, 1), IFDRational(42, 1), IFDRational(0, 1)),
    }
    buf = BytesIO()
    img.save(buf, format="JPEG", exif=exif.tobytes())
    jpeg_bytes = buf.getvalue()

    # EXIF extraction preview endpoint
    exif_resp = client.post(
        "/api/field-reports/extract-exif",
        headers=rep_headers,
        files={"photo": ("malpe.jpg", jpeg_bytes, "image/jpeg")},
    )
    assert exif_resp.status_code == 200
    assert exif_resp.json()["data"]["latitude"] == 13.35
    assert exif_resp.json()["data"]["longitude"] == 74.7
    assert exif_resp.json()["data"]["camera_make"] == "TestCam"

    # Submit geotagged report using extracted EXIF coords
    create_resp = client.post(
        "/api/field-reports",
        headers=rep_headers,
        data={
            "title": "Malpe north shoreline patch",
            "debris_type": "Suspected plastic accumulation",
            "severity": "high",
            "estimated_quantity": "~20 items",
            "location_label": "Malpe Beach",
            "notes": "Observed near high-tide line",
            "observed_direction_deg": "112.5",
            "observed_direction_label": "ESE",
        },
        files={"photo": ("malpe.jpg", jpeg_bytes, "image/jpeg")},
    )
    assert create_resp.status_code == 201
    created = create_resp.json()["data"]
    assert created["latitude"] == 13.35
    assert created["longitude"] == 74.7
    assert created["gps_source"] == "exif"
    assert created["captured_at"] == "2026-11-25T10:15:00"
    assert created["observed_direction_deg"] == 112.5
    assert created["observed_direction_label"] == "ESE"
    assert isinstance(created["confidence_score"], int)
    assert 0 <= created["confidence_score"] <= 100
    assert created["confidence_tier"] in {"High", "Moderate", "Low"}
    assert len(created["confidence_breakdown"]) == 6

    # Also verify photo-only submission (no title/debris_type/coords supplied manually)
    photo_only = client.post(
        "/api/field-reports",
        headers=rep_headers,
        files={"photo": ("auto_malpe.jpg", jpeg_bytes, "image/jpeg")},
    )
    assert photo_only.status_code == 201
    auto_data = photo_only.json()["data"]
    assert auto_data["latitude"] == 13.35
    assert auto_data["longitude"] == 74.7
    assert auto_data["gps_source"] == "exif"
    assert "Suspected marine litter" in auto_data["title"]
    uploaded_auto = Path("storage/uploads") / Path(auto_data["image_url"]).name
    if uploaded_auto.exists():
        uploaded_auto.unlink()

    # Reporter cannot update status
    forbidden = client.patch(
        f"/api/field-reports/{created['id']}/status",
        headers=rep_headers,
        json={"status": "under_review"},
    )
    assert forbidden.status_code == 403

    # Register and login as organisation member
    client.post("/api/auth/register", json={"name": "Karnataka Coastal Cell", "email": "org@example.com", "password": "securepass123", "role": "organisation"})
    org_login = client.post("/api/auth/login", json={"email": "org@example.com", "password": "securepass123"})
    assert org_login.status_code == 200
    org_headers = {"Authorization": f"Bearer {org_login.json()['access_token']}"}

    portal = client.get("/api/field-reports", headers=org_headers)
    assert portal.status_code == 200
    portal_data = portal.json()["data"]
    assert portal_data["total_reported"] >= 1
    assert portal_data["status_counts"]["reported"] >= 1
    assert any(item["id"] == created["id"] for item in portal_data["items"])

    img_fetch = client.get(created["image_url"])
    assert img_fetch.status_code == 200

    status_update = client.patch(
        f"/api/field-reports/{created['id']}/status",
        headers=org_headers,
        json={"status": "under_review"},
    )
    assert status_update.status_code == 200
    assert status_update.json()["data"]["status"] == "under_review"

    # Cleanup uploaded test image
    filename = Path(created["image_url"]).name
    uploaded = Path("storage/uploads") / filename
    if uploaded.exists():
        uploaded.unlink()


def test_environment_surface_vector_validation(client):
    bad = client.get("/api/environment/surface-vector", params={"lat": 200, "lng": 74.6})
    assert bad.status_code == 422

    res = client.get("/api/environment/surface-vector", params={"lat": 13.35, "lng": 74.65})
    assert res.status_code in (200, 502, 503)
    if res.status_code == 200:
        data = res.json()["data"]
        assert "estimated_drift_direction_deg" in data
        assert "coastal_tendency" in data
