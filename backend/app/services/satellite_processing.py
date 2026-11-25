from pathlib import Path
import numpy as np
from PIL import Image

try:
    import rasterio
    from rasterio.enums import Resampling
    RASTERIO_AVAILABLE = True
except Exception:
    RASTERIO_AVAILABLE = False


def normalize(array: np.ndarray) -> np.ndarray:
    array = array.astype(np.float32)
    finite = np.isfinite(array)
    if not finite.any():
        return np.zeros_like(array, dtype=np.uint8)
    low, high = np.percentile(array[finite], (2, 98))
    if high <= low:
        return np.zeros_like(array, dtype=np.uint8)
    normalized = np.clip((array - low) * 255.0 / (high - low), 0, 255)
    return normalized.astype(np.uint8)


def process_geotiff(input_path: str, output_dir: str) -> dict:
    if not RASTERIO_AVAILABLE:
        raise RuntimeError("Rasterio is unavailable")
    input_path = Path(input_path)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    with rasterio.open(input_path) as src:
        if src.count < 2:
            raise ValueError("GeoTIFF must contain usable spectral bands")
        descriptions = [d.lower() if d else "" for d in src.descriptions]
        band_map = {}
        for index, description in enumerate(descriptions, start=1):
            for band_name in ("b2", "b3", "b4", "b8", "blue", "green", "red", "nir"):
                if band_name in description:
                    band_map[band_name] = index
        if not band_map:
            for index in range(1, min(src.count, 8) + 1):
                band_map[str(index)] = index
        def read_band(name: str) -> np.ndarray:
            index = band_map.get(name)
            if index is None:
                raise ValueError(f"Required band {name} is missing")
            return src.read(index).astype(np.float32)
        # Sentinel-2 natural-colour and false-colour exports when B2/B3/B4/B8 are available.
        red = read_band("b4") if "b4" in band_map else read_band("4")
        green = read_band("b3") if "b3" in band_map else read_band("3")
        blue = read_band("b2") if "b2" in band_map else read_band("2")
        nir = read_band("b8") if "b8" in band_map else read_band("8")
        rgb = np.dstack((normalize(red), normalize(green), normalize(blue)))
        false = np.dstack((normalize(nir), normalize(red), normalize(green)))
        ndwi = (green - nir) / (green + nir + 1e-6)

        rgb_path = output_dir / f"{input_path.stem}_true_color.png"
        false_path = output_dir / f"{input_path.stem}_false_color.png"
        ndwi_path = output_dir / f"{input_path.stem}_ndwi.png"
        Image.fromarray(rgb).save(rgb_path)
        Image.fromarray(false).save(false_path)
        finite_ndwi = np.isfinite(ndwi)
        ndwi_u8 = np.zeros(ndwi.shape, dtype=np.uint8)
        if finite_ndwi.any():
            ndwi_u8 = np.interp(ndwi, (-1, 1), (0, 255)).astype(np.uint8)
        Image.fromarray(ndwi_u8).save(ndwi_path)
        bounds = src.bounds
        return {
            "true_color_path": str(rgb_path), "false_color_path": str(false_path), "ndwi_path": str(ndwi_path),
            "width": src.width, "height": src.height, "crs": str(src.crs),
            "bounds": [bounds.left, bounds.bottom, bounds.right, bounds.top],
        }
