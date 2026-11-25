from shapely.geometry import shape, mapping


def geojson_polygon_from_bbox(bbox: list[float]) -> dict:
    if len(bbox) != 4:
        raise ValueError("bbox must contain west, south, east, north")
    west, south, east, north = bbox
    if west > east or south > north:
        raise ValueError("Invalid bounding box")
    polygon = {
        "type": "Polygon",
        "coordinates": [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
    }
    return polygon


def geometry_to_geojson(wkb_element) -> dict | None:
    if wkb_element is None:
        return None
    if hasattr(wkb_element, "__geo_interface__"):
        return wkb_element.__geo_interface__
    return shape(wkb_element).__geo_interface__ if isinstance(wkb_element, dict) else None
