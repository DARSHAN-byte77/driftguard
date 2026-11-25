import { useEffect } from 'react';
import { CircleMarker, MapContainer, Polygon, TileLayer, Tooltip, ZoomControl, useMap } from 'react-leaflet';
import { Crosshair, Waves } from 'lucide-react';
import { incidentColors } from '../data/mockIncidents.js';

const coastCenter = [13.35, 74.63];

function ViewportController({ incident, recenterToken }) {
  const map = useMap();

  useEffect(() => {
    if (incident) {
      map.flyTo([incident.lat, incident.lng], 12, { duration: 0.75 });
    }
  }, [incident, map]);

  useEffect(() => {
    if (recenterToken > 0) {
      map.flyTo(coastCenter, 11, { duration: 0.75 });
    }
  }, [map, recenterToken]);

  return null;
}

export default function DriftMap({ incidents, selectedIncident, onSelect, recenterToken, onRecenter }) {
  const selectedColor = selectedIncident ? incidentColors[selectedIncident.type] ?? '#2dd4bf' : '#2dd4bf';

  return (
    <div className="relative h-full min-h-[410px] w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
      <MapContainer
        center={coastCenter}
        zoom={11}
        scrollWheelZoom
        zoomControl={false}
        className="h-full min-h-[410px] w-full"
      >
        <TileLayer
          attribution='Tiles &copy; Esri, HERE, Garmin, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>, and the GIS user community'
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
        />
        <TileLayer
          attribution='Reference labels &copy; Esri'
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
        />
        <ZoomControl position="topright" />
        <ViewportController incident={selectedIncident} recenterToken={recenterToken} />

        {selectedIncident && (
          <Polygon
            positions={selectedIncident.cone}
            pathOptions={{
              color: selectedColor,
              fillColor: selectedColor,
              fillOpacity: 0.14,
              opacity: 0.72,
              weight: 1.5,
              dashArray: '5 7',
            }}
          />
        )}

        {incidents.map((incident) => {
          const isPickedUp = incident.status === 'Picked up';
          const color = isPickedUp ? '#64748b' : incidentColors[incident.type] ?? '#2dd4bf';
          const isSelected = selectedIncident?.id === incident.id;

          return (
            <CircleMarker
              key={incident.id}
              center={[incident.lat, incident.lng]}
              radius={isSelected ? 9 : 7}
              pathOptions={{
                color: isSelected ? '#f8fafc' : color,
                fillColor: color,
                fillOpacity: isPickedUp ? 0.5 : 0.94,
                weight: isSelected ? 2.5 : 1.5,
              }}
              eventHandlers={{ click: () => onSelect(incident) }}
            >
              <Tooltip direction="top" offset={[0, -8]}>
                <span className="font-semibold">{incident.id}</span> · {incident.type}
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>

      <div className="pointer-events-none absolute left-4 top-4 z-[500] flex items-center gap-2 rounded-lg border border-slate-700/80 bg-slate-950/85 px-3 py-2 shadow-lg backdrop-blur-md">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-400" />
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-200">Live surveillance</span>
      </div>

      {selectedIncident && (
        <div className="pointer-events-none absolute left-4 top-[66px] z-[500] flex items-center gap-2 rounded-lg border border-slate-700/80 bg-slate-950/85 px-3 py-2 shadow-lg backdrop-blur-md">
          <Waves size={14} className="text-teal-300" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-200">48h drift forecast</span>
        </div>
      )}

      <button
        type="button"
        onClick={onRecenter}
        aria-label="Recenter map on Malpe coast"
        title="Recenter map"
        className="absolute bottom-[118px] right-[10px] z-[500] grid h-[34px] w-[34px] place-items-center rounded border border-slate-700 bg-slate-950 text-slate-200 shadow-md transition hover:bg-slate-800"
      >
        <Crosshair size={16} />
      </button>

      <div className="pointer-events-none absolute bottom-4 left-4 z-[500] flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-slate-700/80 bg-slate-950/90 px-3 py-2.5 shadow-lg backdrop-blur-md">
        {Object.entries(incidentColors).slice(0, 3).map(([type, color]) => (
          <span key={type} className="flex items-center gap-1.5 text-[10px] font-medium text-slate-300">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
            {type}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-[10px] font-medium text-slate-300">
          <span className="h-2 w-2 rounded-full bg-slate-500" />
          Recovered
        </span>
      </div>
    </div>
  );
}
