import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { CircleMarker, GeoJSON, MapContainer, Polyline, TileLayer, Tooltip, ZoomControl, useMap } from 'react-leaflet';
import { Crosshair, Layers, Map as MapIcon, Satellite, Tag } from 'lucide-react';
import {
  KARNATAKA_COAST_STATIONS,
  computeCandidateConfidence,
  formatArea,
  projectEndpoint,
} from '../utils/geoMetrics.js';

const KARNATAKA_CENTER = [13.15, 74.57];
const DEFAULT_ZOOM = 10;

const SATELLITE_TILE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const SATELLITE_ATTRIBUTION =
  'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community';

const LABELS_TILE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';
const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION = '&copy; OpenStreetMap contributors';

const LAYER_STYLES = {
  red: {
    color: '#ef4444',
    fillColor: '#ef4444',
    fillOpacity: 0.4,
    weight: 1.4,
    opacity: 0.92,
  },
  yellow: {
    color: '#eab308',
    fillColor: '#eab308',
    fillOpacity: 0.24,
    weight: 1,
    opacity: 0.8,
  },
  selected: {
    color: '#f8fafc',
    fillColor: '#38bdf8',
    fillOpacity: 0.3,
    weight: 2.5,
    opacity: 1,
  },
};

function getCandidateTitle(level) {
  return level === 'red' ? 'Suspected marine litter' : 'Moderate candidate';
}

function MapBridge({ side, mapsRef, syncingRef }) {
  const map = useMap();

  useEffect(() => {
    const otherSide = side === 'left' ? 'right' : 'left';
    mapsRef.current[side] = map;

    const syncPartner = () => {
      if (syncingRef.current) return;
      const partner = mapsRef.current[otherSide];
      if (!partner) return;
      syncingRef.current = true;
      try {
        partner.setView(map.getCenter(), map.getZoom(), { animate: false });
      } finally {
        syncingRef.current = false;
      }
    };

    map.on('move', syncPartner);
    map.on('zoom', syncPartner);

    const container = map.getContainer();
    const observer = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
    });
    observer.observe(container);

    return () => {
      map.off('move', syncPartner);
      map.off('zoom', syncPartner);
      observer.disconnect();
      if (mapsRef.current[side] === map) {
        mapsRef.current[side] = null;
      }
    };
  }, [map, mapsRef, side, syncingRef]);

  return null;
}

function computeDataBounds(redData, yellowData) {
  const combined = L.latLngBounds([]);
  for (const fc of [redData, yellowData]) {
    if (fc?.features?.length) {
      const layerBounds = L.geoJSON(fc).getBounds();
      if (layerBounds.isValid()) {
        combined.extend(layerBounds);
      }
    }
  }
  return combined.isValid() ? combined : null;
}

function buildArrowSegments(lat, lng, bearingDeg, lengthKm = 4.0) {
  const tip = projectEndpoint(lat, lng, bearingDeg, lengthKm);
  const headLenKm = lengthKm * 0.28;
  const wingLeft = projectEndpoint(tip[0], tip[1], (bearingDeg + 150) % 360, headLenKm);
  const wingRight = projectEndpoint(tip[0], tip[1], (bearingDeg + 210) % 360, headLenKm);
  return {
    shaft: [
      [lat, lng],
      tip,
    ],
    head: [wingLeft, tip, wingRight],
  };
}

export default function DriftMap({
  redData,
  yellowData,
  showRed,
  showYellow,
  onToggleRed,
  onToggleYellow,
  selectedFeature,
  onSelectFeature,
  recenterToken,
  onRecenter,
  dataVersion,
  focusTarget,
  directionOverlay,
}) {
  const mapsRef = useRef({ left: null, right: null });
  const syncingRef = useRef(false);
  const hasFittedRef = useRef(false);
  const [basemapMode, setBasemapMode] = useState('satellite'); // 'satellite' | 'street'
  const [showLabels, setShowLabels] = useState(true);

  const dataBounds = useMemo(() => computeDataBounds(redData, yellowData), [redData, yellowData]);

  useEffect(() => {
    const leftMap = mapsRef.current.left;
    const rightMap = mapsRef.current.right;
    if (!leftMap || !rightMap) return;
    if (!dataBounds && hasFittedRef.current && recenterToken === 0) return;

    syncingRef.current = true;
    try {
      if (dataBounds) {
        leftMap.fitBounds(dataBounds, { padding: [24, 24], maxZoom: 13, animate: false });
        rightMap.setView(leftMap.getCenter(), leftMap.getZoom(), { animate: false });
        hasFittedRef.current = true;
      } else {
        leftMap.setView(KARNATAKA_CENTER, DEFAULT_ZOOM, { animate: false });
        rightMap.setView(KARNATAKA_CENTER, DEFAULT_ZOOM, { animate: false });
      }
    } finally {
      syncingRef.current = false;
    }
  }, [dataBounds, recenterToken]);

  useEffect(() => {
    if (!focusTarget) return;
    const leftMap = mapsRef.current.left;
    const rightMap = mapsRef.current.right;
    if (!leftMap || !rightMap) return;

    syncingRef.current = true;
    try {
      const targetZoom = Math.max(leftMap.getZoom(), focusTarget.zoom ?? 13);
      leftMap.setView([focusTarget.lat, focusTarget.lng], targetZoom, { animate: true });
      rightMap.setView([focusTarget.lat, focusTarget.lng], targetZoom, { animate: true });
    } finally {
      syncingRef.current = false;
    }
  }, [focusTarget]);

  const bindFeatureHandlers = (level) => (feature, layer) => {
    const props = feature?.properties ?? {};
    const title = getCandidateTitle(props.level ?? level);
    const areaText = formatArea(props.area);
    const pixelCount = props.count ?? '—';
    const conf = computeCandidateConfidence(feature);

    layer.bindTooltip(
      `<div class="text-[11px] leading-snug">
        <div class="font-semibold">${title} · ${conf.score}/100 (${conf.tier})</div>
        <div class="text-slate-300">Area: ${areaText}</div>
        <div class="text-slate-400">Pixels: ${pixelCount}</div>
      </div>`,
      { sticky: true, direction: 'top', offset: [0, -6] },
    );

    layer.on({
      click: () => {
        onSelectFeature?.(feature);
      },
    });
  };

  const arrow = useMemo(() => {
    if (!directionOverlay || typeof directionOverlay.bearingDeg !== 'number') return null;
    return buildArrowSegments(directionOverlay.lat, directionOverlay.lng, directionOverlay.bearingDeg, 4.5);
  }, [directionOverlay]);

  const axisLine = useMemo(() => {
    if (!directionOverlay || typeof directionOverlay.axisDeg !== 'number') return null;
    const p1 = projectEndpoint(directionOverlay.lat, directionOverlay.lng, directionOverlay.axisDeg, 1.8);
    const p2 = projectEndpoint(directionOverlay.lat, directionOverlay.lng, (directionOverlay.axisDeg + 180) % 360, 1.8);
    return [p1, p2];
  }, [directionOverlay]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <div className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950/80 p-1">
          <button
            type="button"
            onClick={() => setBasemapMode('satellite')}
            className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[10px] font-semibold transition ${
              basemapMode === 'satellite'
                ? 'bg-teal-500/20 text-teal-200'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Satellite size={11} />
            Satellite
          </button>
          <button
            type="button"
            onClick={() => setBasemapMode('street')}
            className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[10px] font-semibold transition ${
              basemapMode === 'street'
                ? 'bg-teal-500/20 text-teal-200'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <MapIcon size={11} />
            Coastal Street Map
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowLabels((v) => !v)}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold transition ${
            showLabels
              ? 'border-teal-500/35 bg-teal-500/15 text-teal-200'
              : 'border-slate-800 bg-slate-950/80 text-slate-400 hover:text-slate-200'
          }`}
        >
          <Tag size={11} />
          Place names &amp; coastal labels: {showLabels ? 'On' : 'Off'}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* Left panel: basemap + place labels only */}
        <div className="relative h-[380px] w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-900 sm:h-[480px]">
          <MapContainer
            center={KARNATAKA_CENTER}
            zoom={DEFAULT_ZOOM}
            scrollWheelZoom
            zoomControl={false}
            className="h-full w-full"
          >
            <TileLayer
              attribution={basemapMode === 'satellite' ? SATELLITE_ATTRIBUTION : OSM_ATTRIBUTION}
              url={basemapMode === 'satellite' ? SATELLITE_TILE_URL : OSM_TILE_URL}
            />
            {basemapMode === 'satellite' && showLabels && (
              <TileLayer attribution="Labels &copy; Esri" url={LABELS_TILE_URL} />
            )}
            {showLabels &&
              KARNATAKA_COAST_STATIONS.map((st) => (
                <CircleMarker
                  key={`left-st-${st.name}`}
                  center={[st.lat, st.lng]}
                  radius={3.5}
                  pathOptions={{ color: '#e2e8f0', fillColor: '#0f172a', fillOpacity: 0.9, weight: 1.5 }}
                >
                  <Tooltip permanent direction="right" offset={[6, 0]} className="coastal-label">
                    {st.name}
                  </Tooltip>
                </CircleMarker>
              ))}
            <ZoomControl position="topright" />
            <MapBridge side="left" mapsRef={mapsRef} syncingRef={syncingRef} />
          </MapContainer>

          <div className="pointer-events-none absolute left-3 top-3 z-[500] flex items-center gap-2 rounded-lg border border-slate-700/80 bg-slate-950/85 px-3 py-1.5 shadow-lg backdrop-blur-md">
            <Satellite size={13} className="text-teal-300" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-200">
              {basemapMode === 'satellite' ? 'Satellite basemap' : 'Coastal basemap'}
            </span>
          </div>
        </div>

        {/* Right panel: basemap + place labels + red and yellow candidate polygons */}
        <div className="relative h-[380px] w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-900 sm:h-[480px]">
          <MapContainer
            center={KARNATAKA_CENTER}
            zoom={DEFAULT_ZOOM}
            scrollWheelZoom
            zoomControl={false}
            preferCanvas
            className="h-full w-full"
          >
            <TileLayer
              attribution={basemapMode === 'satellite' ? SATELLITE_ATTRIBUTION : OSM_ATTRIBUTION}
              url={basemapMode === 'satellite' ? SATELLITE_TILE_URL : OSM_TILE_URL}
            />
            {basemapMode === 'satellite' && showLabels && (
              <TileLayer attribution="Labels &copy; Esri" url={LABELS_TILE_URL} />
            )}
            {showLabels &&
              KARNATAKA_COAST_STATIONS.map((st) => (
                <CircleMarker
                  key={`right-st-${st.name}`}
                  center={[st.lat, st.lng]}
                  radius={3.5}
                  pathOptions={{ color: '#e2e8f0', fillColor: '#0f172a', fillOpacity: 0.9, weight: 1.5 }}
                >
                  <Tooltip permanent direction="right" offset={[6, 0]} className="coastal-label">
                    {st.name}
                  </Tooltip>
                </CircleMarker>
              ))}
            <ZoomControl position="topright" />
            <MapBridge side="right" mapsRef={mapsRef} syncingRef={syncingRef} />

            {showYellow && yellowData?.features?.length > 0 && (
              <GeoJSON
                key={`yellow-${dataVersion}-${yellowData.features.length}`}
                data={yellowData}
                smoothFactor={1.5}
                style={() => LAYER_STYLES.yellow}
                onEachFeature={bindFeatureHandlers('yellow')}
              />
            )}

            {showRed && redData?.features?.length > 0 && (
              <GeoJSON
                key={`red-${dataVersion}-${redData.features.length}`}
                data={redData}
                smoothFactor={1.5}
                style={() => LAYER_STYLES.red}
                onEachFeature={bindFeatureHandlers('red')}
              />
            )}

            {selectedFeature && (
              <GeoJSON
                key={`selected-${selectedFeature.id ?? JSON.stringify(selectedFeature.properties)}`}
                data={selectedFeature}
                style={() => LAYER_STYLES.selected}
              />
            )}

            {axisLine && (
              <Polyline
                positions={axisLine}
                pathOptions={{ color: '#38bdf8', weight: 2, dashArray: '5 5', opacity: 0.9 }}
              >
                <Tooltip sticky>
                  Polygon orientation axis: {directionOverlay.axisDeg}° ({directionOverlay.axisLabel})
                </Tooltip>
              </Polyline>
            )}

            {arrow && (
              <>
                <Polyline
                  positions={arrow.shaft}
                  pathOptions={{ color: '#2dd4bf', weight: 3.5, opacity: 0.95 }}
                >
                  <Tooltip sticky>
                    Instantaneous transport vector: {directionOverlay.bearingDeg}° ({directionOverlay.compass})
                  </Tooltip>
                </Polyline>
                <Polyline
                  positions={arrow.head}
                  pathOptions={{ color: '#2dd4bf', weight: 3.5, opacity: 0.95 }}
                />
              </>
            )}
          </MapContainer>

          <div className="pointer-events-none absolute left-3 top-3 z-[500] flex items-center gap-2 rounded-lg border border-slate-700/80 bg-slate-950/85 px-3 py-1.5 shadow-lg backdrop-blur-md">
            <Layers size={13} className="text-teal-300" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-200">
              Suspected litter candidates
            </span>
          </div>

          <div className="absolute bottom-3 left-3 z-[500] flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-950/90 p-1.5 shadow-lg backdrop-blur-md">
            <button
              type="button"
              onClick={onToggleRed}
              className={`flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-semibold transition ${
                showRed
                  ? 'bg-red-500/20 text-red-200 ring-1 ring-red-500/40'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <span className="h-2 w-2 rounded-sm bg-red-500" />
              Strong ({redData?.features?.length ?? 0})
            </button>
            <button
              type="button"
              onClick={onToggleYellow}
              className={`flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-semibold transition ${
                showYellow
                  ? 'bg-yellow-500/20 text-yellow-200 ring-1 ring-yellow-500/40'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <span className="h-2 w-2 rounded-sm bg-yellow-400" />
              Moderate ({yellowData?.features?.length ?? 0})
            </button>
          </div>

          <button
            type="button"
            onClick={onRecenter}
            aria-label="Fit map to candidate extent"
            title="Fit to candidate extent"
            className="absolute bottom-3 right-3 z-[500] grid h-[34px] w-[34px] place-items-center rounded border border-slate-700 bg-slate-950/90 text-slate-200 shadow-md transition hover:bg-slate-800"
          >
            <Crosshair size={16} />
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/70 px-3.5 py-2.5 text-[11px]">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <span className="flex items-center gap-2 font-medium text-slate-200">
            <span className="h-3 w-3 rounded-sm border border-red-400 bg-red-500/80" />
            Suspected marine litter
          </span>
          <span className="flex items-center gap-2 font-medium text-slate-200">
            <span className="h-3 w-3 rounded-sm border border-yellow-300 bg-yellow-400/80" />
            Moderate candidate
          </span>
          {arrow && (
            <span className="flex items-center gap-2 font-medium text-teal-200">
              <span className="h-0.5 w-4 bg-teal-400" />
              Surface transport vector ({directionOverlay.bearingDeg}° {directionOverlay.compass})
            </span>
          )}
        </div>
        <span className="text-[11px] font-medium text-amber-300/90">
          Candidates only, not confirmed plastic.
        </span>
      </div>
    </div>
  );
}
