# MarineWatch API

All successful responses use `{ "success": true, "data": ..., "error": null }`. Validation and HTTP errors use FastAPI/JSON error responses.

## Authentication

- `POST /api/auth/register` — body `{name,email,password,role}`. Role: `admin`, `analyst`, or `viewer`. 201 on success.
- `POST /api/auth/login` — body `{email,password}`; returns `{access_token,token_type}`.
- `GET /api/auth/me` — `Authorization: Bearer <token>`.

## Coastal zones

- `GET /api/zones?page=1&page_size=20&country=` — paginated zones.
- `POST /api/zones` — body `{zone_name,state,country,description,bboundary_geojson}`. A Polygon GeoJSON in SRID 4326.
- `GET /api/zones/{zone_id}`.
- `PUT /api/zones/{zone_id}` — partial update fields.
- `DELETE /api/zones/{zone_id}` — 204.

## Satellite imagery

- `GET /api/satellite/search?bbox=west,south,east,north&start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&max_cloud=30` — live Copernicus catalogue or HTTP 502 on provider failure.
- `POST /api/satellite/fetch` — body `{product_id,coastal_zone_id}`. 503 if credentials are absent.
- `GET /api/satellite/images?page=1&page_size=20&zone_id=`.
- `GET /api/satellite/images/{image_id}`.
- `POST /api/satellite/process/{image_id}` — creates PNG composites/NDWI for an existing local GeoTIFF.

## Detections

- `GET /api/detections?page=1&page_size=20&zone_id=&verification_status=&category=` — Leaflet-ready fields.
- `GET /api/detections/{detection_id}`.
- `POST /api/detections` — body `{satellite_image_id,coastal_zone_id,debris_category,confidence_score,detection_status,verification_status,latitude,longitude,area_estimate}`.
- `PATCH /api/detections/{detection_id}/verification` — body `{verification_status}`.

Baseline results do not have a real model confidence value. `detection_status=experimental_candidate` and `verification_status=needs_field_check`.

## Analytics

- `GET /api/analytics/dashboard`.
- `GET /api/analytics/coastal-risk`.
- `GET /api/analytics/detection-trends`.

## Reports

- `POST /api/reports/generate` — body `{coastal_zone_id,report_title}`.
- `GET /api/reports?page=1&page_size=20&zone_id=`.
- `GET /api/reports/{report_id}`.

## Swagger

Interactive Swagger: `GET /docs`. OpenAPI JSON: `GET /openapi.json`.
