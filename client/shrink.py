"""Shrink full GEE GeoJSON exports into lightweight web-ready *_small.geojson files
and generate metadata.json in client/public/data/.

Usage (from client/):
    python shrink.py --window "2025-01-01 to 2025-01-15"
"""

import argparse
import datetime
import json
from pathlib import Path


def round_coords(obj, precision=5):
    if isinstance(obj, list):
        if obj and isinstance(obj[0], (int, float)):
            return [round(v, precision) for v in obj]
        return [round_coords(item, precision) for item in obj]
    return obj


def shrink_geojson(input_path: Path, output_path: Path, max_features: int, min_area: float, precision: int) -> int:
    with input_path.open("r", encoding="utf-8") as f:
        data = json.load(f)

    features = data.get("features", [])
    if min_area > 0:
        features = [ft for ft in features if (ft.get("properties") or {}).get("area", 0) >= min_area]

    # Keep the largest candidate clusters first so high-signal areas remain visible
    features.sort(key=lambda ft: (ft.get("properties") or {}).get("area", 0), reverse=True)
    if max_features > 0:
        features = features[:max_features]

    slim_features = []
    for ft in features:
        props = ft.get("properties") or {}
        geom = ft.get("geometry") or {}
        slim_features.append(
            {
                "type": "Feature",
                "id": ft.get("id"),
                "geometry": {
                    "type": geom.get("type"),
                    "coordinates": round_coords(geom.get("coordinates", []), precision),
                },
                "properties": {
                    "area": round(float(props.get("area", 0)), 2),
                    "count": int(props.get("count", 0)),
                    "label": props.get("label"),
                    "level": props.get("level"),
                },
            }
        )

    out_collection = {"type": "FeatureCollection", "features": slim_features}
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as f:
        json.dump(out_collection, f, separators=(",", ":"))

    return len(slim_features)


def main():
    base_dir = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description="Create *_small.geojson and metadata.json for DriftGuard.")
    parser.add_argument("--red", type=Path, default=base_dir / "red.geojson", help="Path to full red.geojson")
    parser.add_argument("--yellow", type=Path, default=base_dir / "yellow.geojson", help="Path to full yellow.geojson")
    parser.add_argument("--out-dir", type=Path, default=base_dir / "public" / "data", help="Output directory")
    parser.add_argument("--max-features", type=int, default=600, help="Max features per layer (0 for unlimited)")
    parser.add_argument("--min-area", type=float, default=0.0, help="Minimum polygon area in square meters")
    parser.add_argument("--precision", type=int, default=5, help="Coordinate decimal precision")
    parser.add_argument(
        "--window",
        type=str,
        default="Not specified (re-run shrink.py --window \"YYYY-MM-DD to YYYY-MM-DD\")",
        help="Sentinel-2 acquisition window string from Google Earth Engine",
    )
    parser.add_argument(
        "--source",
        type=str,
        default="Google Earth Engine (Sentinel-2 L2A)",
        help="Data source label for metadata.json",
    )
    parser.add_argument(
        "--generated",
        type=str,
        default="",
        help="ISO timestamp when the GEE export was generated (defaults to source file mtime)",
    )
    args = parser.parse_args()

    for src in (args.red, args.yellow):
        if not src.exists():
            raise SystemExit(f"Input file not found: {src}")

    red_out = args.out_dir / "red_small.geojson"
    yellow_out = args.out_dir / "yellow_small.geojson"

    red_count = shrink_geojson(args.red, red_out, args.max_features, args.min_area, args.precision)
    yellow_count = shrink_geojson(args.yellow, yellow_out, args.max_features, args.min_area, args.precision)

    generated = args.generated.strip()
    if not generated:
        latest_mtime = max(args.red.stat().st_mtime, args.yellow.stat().st_mtime)
        generated = datetime.datetime.fromtimestamp(latest_mtime).astimezone().isoformat(timespec="seconds")

    metadata = {
        "generated": generated,
        "window": args.window,
        "source": args.source,
    }
    meta_out = args.out_dir / "metadata.json"
    with meta_out.open("w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    print(f"Wrote {red_count} features -> {red_out} ({red_out.stat().st_size / 1024:.1f} KB)")
    print(f"Wrote {yellow_count} features -> {yellow_out} ({yellow_out.stat().st_size / 1024:.1f} KB)")
    print(f"Wrote metadata -> {meta_out}")


if __name__ == "__main__":
    main()
