const EARTH_RADIUS_KM = 6371;

export const COMPASS_8_POINTS = [
  { label: 'N', deg: 0 },
  { label: 'NE', deg: 45 },
  { label: 'E', deg: 90 },
  { label: 'SE', deg: 135 },
  { label: 'S', deg: 180 },
  { label: 'SW', deg: 225 },
  { label: 'W', deg: 270 },
  { label: 'NW', deg: 315 },
];

const COMPASS_16_POINTS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
];

export const KARNATAKA_COAST_STATIONS = [
  { name: 'Karwar', lat: 14.8136, lng: 74.1297 },
  { name: 'Honnavar', lat: 14.2798, lng: 74.4439 },
  { name: 'Bhatkal', lat: 13.9858, lng: 74.5446 },
  { name: 'Kundapura', lat: 13.6213, lng: 74.6897 },
  { name: 'Malpe', lat: 13.3526, lng: 74.7026 },
  { name: "St. Mary's Islands", lat: 13.3794, lng: 74.6731 },
  { name: 'Kaup', lat: 13.2254, lng: 74.7385 },
  { name: 'Mulki', lat: 13.0928, lng: 74.7779 },
  { name: 'Panambur / Mangalore', lat: 12.9367, lng: 74.8056 },
];

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

export function formatArea(areaSqM) {
  if (typeof areaSqM !== 'number' || Number.isNaN(areaSqM)) return '—';
  if (areaSqM >= 10000) {
    return `${(areaSqM / 10000).toFixed(2)} ha (${Math.round(areaSqM).toLocaleString()} m²)`;
  }
  return `${Math.round(areaSqM).toLocaleString()} m²`;
}

function toDeg(rad) {
  return (rad * 180) / Math.PI;
}

export function degToCompass(deg) {
  if (typeof deg !== 'number' || Number.isNaN(deg)) return '—';
  const idx = Math.floor((((deg % 360) + 360) % 360) / 22.5 + 0.5) % 16;
  return COMPASS_16_POINTS[idx];
}

export function extractVertices(geometry) {
  const points = [];
  if (!geometry?.coordinates) return points;

  const walk = (node) => {
    if (!Array.isArray(node) || node.length === 0) return;
    if (typeof node[0] === 'number' && typeof node[1] === 'number') {
      points.push([node[0], node[1]]);
      return;
    }
    for (const child of node) {
      walk(child);
    }
  };

  walk(geometry.coordinates);
  return points;
}

export function getFeatureCentroid(feature) {
  const pts = extractVertices(feature?.geometry);
  if (pts.length === 0) return null;
  let sumLng = 0;
  let sumLat = 0;
  for (const [lng, lat] of pts) {
    sumLng += lng;
    sumLat += lat;
  }
  return {
    lat: sumLat / pts.length,
    lng: sumLng / pts.length,
    vertexCount: pts.length,
  };
}

export function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function bearingBetween(lat1, lng1, lat2, lng2) {
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dLambda = toRad(lng2 - lng1);
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function nearestCoastalStation(lat, lng) {
  let best = null;
  for (const station of KARNATAKA_COAST_STATIONS) {
    const distanceKm = haversineKm(lat, lng, station.lat, station.lng);
    if (!best || distanceKm < best.distanceKm) {
      best = {
        name: station.name,
        distanceKm: Number(distanceKm.toFixed(1)),
        bearingToCoastDeg: Number(bearingBetween(lat, lng, station.lat, station.lng).toFixed(0)),
      };
    }
  }
  if (best) {
    best.bearingToCoastCompass = degToCompass(best.bearingToCoastDeg);
  }
  return best;
}

/**
 * Computes principal elongation axis (0-180 deg) from polygon coordinates
 * using 2x2 covariance PCA in local meter coordinates.
 */
export function analyzePolygonOrientation(feature) {
  const pts = extractVertices(feature?.geometry);
  const centroid = getFeatureCentroid(feature);
  if (!centroid || pts.length < 3) return null;

  const metersPerDegLat = 110540;
  const metersPerDegLng = 111320 * Math.cos(toRad(centroid.lat));

  const projected = pts.map(([lng, lat]) => [
    (lng - centroid.lng) * metersPerDegLng,
    (lat - centroid.lat) * metersPerDegLat,
  ]);

  let cxx = 0;
  let cyy = 0;
  let cxy = 0;
  for (const [x, y] of projected) {
    cxx += x * x;
    cyy += y * y;
    cxy += x * y;
  }
  cxx /= projected.length;
  cyy /= projected.length;
  cxy /= projected.length;

  const trace = cxx + cyy;
  const detTerm = Math.sqrt(Math.max(0, (cxx - cyy) ** 2 + 4 * cxy * cxy));
  const lambda1 = (trace + detTerm) / 2;
  const lambda2 = Math.max(1e-6, (trace - detTerm) / 2);
  const elongationRatio = Number(Math.sqrt(lambda1 / lambda2).toFixed(2));

  // Angle CCW from East axis in meters
  const thetaEastRad = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
  // Convert to clockwise bearing from North (0..180 bidirectional axis)
  const axisDeg = ((90 - toDeg(thetaEastRad)) % 180 + 180) % 180;
  const oppositeDeg = (axisDeg + 180) % 360;

  let morphology = 'Compact cluster';
  if (elongationRatio >= 2.5) {
    morphology = 'Linear filament / slick';
  } else if (elongationRatio >= 1.5) {
    morphology = 'Elongated candidate patch';
  }

  return {
    centroid,
    axisDeg: Number(axisDeg.toFixed(0)),
    axisLabel: `${degToCompass(axisDeg)}–${degToCompass(oppositeDeg)}`,
    elongationRatio,
    morphology,
    nearestCoast: nearestCoastalStation(centroid.lat, centroid.lng),
  };
}

/**
 * Projects an endpoint [lat, lng] from a starting point along a compass bearing.
 */
export function projectEndpoint(lat, lng, bearingDeg, distanceKm) {
  const delta = distanceKm / EARTH_RADIUS_KM;
  const theta = toRad(bearingDeg);
  const phi1 = toRad(lat);
  const lambda1 = toRad(lng);

  const phi2 = Math.asin(
    Math.sin(phi1) * Math.cos(delta) +
      Math.cos(phi1) * Math.sin(delta) * Math.cos(theta),
  );
  const lambda2 =
    lambda1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
      Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2),
    );

  return [toDeg(phi2), toDeg(lambda2)];
}

/**
 * Deterministic rule-based screening score (0-100) computed strictly from
 * real GeoJSON properties (level, pixel count, area) and polygon elongation.
 */
export function computeCandidateConfidence(feature, precomputedOrientation = null) {
  const props = feature?.properties ?? {};
  const level = props.level === 'red' ? 'red' : 'yellow';
  const count = Math.max(0, Number(props.count) || 0);
  const area = Math.max(0, Number(props.area) || 0);
  const orientation = precomputedOrientation ?? analyzePolygonOrientation(feature);
  const elongation = orientation?.elongationRatio ?? 1.0;

  const levelPts = level === 'red' ? 40 : 22;
  const pixelPts = Math.min(25, Math.round((Math.log10(count + 1) / 3.5) * 25));
  const areaPts = Math.min(20, Math.round((Math.log10(Math.max(area, 1000) / 1000) / 3.5) * 20));
  const shapePts = elongation >= 2.0 ? 15 : elongation >= 1.4 ? 10 : 5;

  const score = Math.min(100, levelPts + pixelPts + areaPts + shapePts);
  const tier = score >= 75 ? 'High' : score >= 55 ? 'Moderate' : 'Low';

  return {
    score,
    tier,
    breakdown: [
      { label: `GEE threshold (${level})`, points: levelPts, max: 40 },
      { label: `Pixel support (${count} px)`, points: pixelPts, max: 25 },
      { label: 'Footprint area', points: areaPts, max: 20 },
      { label: `Shape coherence (${elongation}×)`, points: shapePts, max: 15 },
    ],
  };
}
