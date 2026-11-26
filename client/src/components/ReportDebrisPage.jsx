import { useEffect, useState } from 'react';
import { CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  MapPin,
  Navigation,
  Sparkles,
  Upload,
} from 'lucide-react';
import { COMPASS_8_POINTS, nearestCoastalStation } from '../utils/geoMetrics.js';

const KARNATAKA_DEFAULT = [13.15, 74.57];
const SATELLITE_TILE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const LABELS_TILE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';

const DEBRIS_CATEGORIES = [
  'Suspected marine litter',
  'Suspected plastic accumulation',
  'Suspected ghost net / fishing gear',
  'Mixed shoreline litter',
  'Suspected floating debris',
];

function LocationPickerMap({ lat, lng, onPick }) {
  function MapClickHandler() {
    const map = useMap();
    useMapEvents({
      click(e) {
        onPick(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)), 'map_click');
      },
    });

    useEffect(() => {
      if (lat !== null && lng !== null && !Number.isNaN(lat) && !Number.isNaN(lng)) {
        map.setView([lat, lng], Math.max(map.getZoom(), 11));
      }
    }, [lat, lng, map]);

    return null;
  }

  const hasCoords = lat !== null && lng !== null && !Number.isNaN(lat) && !Number.isNaN(lng);

  return (
    <div className="h-[240px] w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
      <MapContainer
        center={hasCoords ? [lat, lng] : KARNATAKA_DEFAULT}
        zoom={hasCoords ? 12 : 9}
        scrollWheelZoom
        className="h-full w-full"
      >
        <TileLayer attribution="Tiles &copy; Esri" url={SATELLITE_TILE_URL} />
        <TileLayer attribution="Labels &copy; Esri" url={LABELS_TILE_URL} />
        <MapClickHandler />
        {hasCoords && (
          <CircleMarker
            center={[lat, lng]}
            radius={8}
            pathOptions={{ color: '#f8fafc', fillColor: '#2dd4bf', fillOpacity: 0.9, weight: 2 }}
          />
        )}
      </MapContainer>
    </div>
  );
}

function deriveCoastalSummary(lat, lng) {
  const nearest = nearestCoastalStation(lat, lng);
  if (!nearest) return { locationLabel: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, nearestName: null };
  return {
    locationLabel: `${nearest.distanceKm} km from ${nearest.name}`,
    nearestName: nearest.name,
  };
}

export default function ReportDebrisPage({ token, onOpenPortal }) {
  const [photoFile, setPhotoFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [exifInfo, setExifInfo] = useState(null);
  const [detecting, setDetecting] = useState(false);

  const [title, setTitle] = useState('');
  const [debrisType, setDebrisType] = useState(DEBRIS_CATEGORIES[0]);
  const [severity, setSeverity] = useState('medium');
  const [estimatedQuantity, setEstimatedQuantity] = useState('');
  const [locationLabel, setLocationLabel] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [gpsSource, setGpsSource] = useState('manual');
  const [observedDirectionDeg, setObservedDirectionDeg] = useState('');
  const [observedDirectionLabel, setObservedDirectionLabel] = useState('');
  const [capturedAt, setCapturedAt] = useState('');
  const [notes, setNotes] = useState('');
  const [showOptional, setShowOptional] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [createdReport, setCreatedReport] = useState(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function applyDetectedLocation(lat, lng, source, currentCategory = debrisType) {
    setLatitude(String(lat));
    setLongitude(String(lng));
    setGpsSource(source);
    const { locationLabel: autoLoc, nearestName } = deriveCoastalSummary(lat, lng);
    setLocationLabel(autoLoc);
    setTitle(nearestName ? `${currentCategory} near ${nearestName}` : `${currentCategory} (${lat.toFixed(3)}, ${lng.toFixed(3)})`);
  }

  function tryDeviceGps(silent = false) {
    if (!navigator.geolocation) {
      if (!silent) setError('Browser geolocation is unavailable on this device.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        applyDetectedLocation(
          Number(pos.coords.latitude.toFixed(6)),
          Number(pos.coords.longitude.toFixed(6)),
          'browser_gps',
        );
      },
      () => {
        if (!silent) {
          setError('Could not access device GPS. Click the map or enter coordinates.');
        }
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError('');
    setCreatedReport(null);
    setPhotoFile(file);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));

    const fallbackTime = file.lastModified
      ? new Date(file.lastModified).toISOString().slice(0, 19)
      : '';
    setCapturedAt(fallbackTime);

    setDetecting(true);
    try {
      const form = new FormData();
      form.append('photo', file);
      const res = await fetch('/api/field-reports/extract-exif', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.data) {
        setExifInfo(body.data);
        if (body.data.captured_at) {
          setCapturedAt(body.data.captured_at);
        }
        if (body.data.latitude != null && body.data.longitude != null) {
          applyDetectedLocation(body.data.latitude, body.data.longitude, 'exif');
        } else {
          // Photo lacks embedded EXIF GPS -> automatically try device GPS silently
          tryDeviceGps(true);
        }
      }
    } catch {
      tryDeviceGps(true);
    } finally {
      setDetecting(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setCreatedReport(null);

    if (!photoFile) {
      setError('Please select a photo first.');
      return;
    }
    const parsedLat = Number.parseFloat(latitude);
    const parsedLng = Number.parseFloat(longitude);
    if (Number.isNaN(parsedLat) || Number.isNaN(parsedLng)) {
      setError('No GPS tag found in this photo—allow device GPS or click the map once to pin the location.');
      return;
    }

    setSubmitting(true);
    try {
      const form = new FormData();
      form.append('photo', photoFile);
      form.append('debris_type', debrisType);
      form.append('severity', severity);
      form.append('latitude', String(parsedLat));
      form.append('longitude', String(parsedLng));
      form.append('gps_source', gpsSource);
      if (title.trim()) form.append('title', title.trim());
      if (estimatedQuantity.trim()) form.append('estimated_quantity', estimatedQuantity.trim());
      if (locationLabel.trim()) form.append('location_label', locationLabel.trim());
      if (capturedAt.trim()) form.append('captured_at', capturedAt.trim());
      if (notes.trim()) form.append('notes', notes.trim());
      if (observedDirectionDeg !== '') {
        form.append('observed_direction_deg', String(observedDirectionDeg));
        if (observedDirectionLabel) form.append('observed_direction_label', observedDirectionLabel);
      }

      const res = await fetch('/api/field-reports', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.detail || 'Failed to submit geotagged report.');
      }

      setCreatedReport(body.data);
      setTitle('');
      setEstimatedQuantity('');
      setLocationLabel('');
      setObservedDirectionDeg('');
      setObservedDirectionLabel('');
      setNotes('');
      setPhotoFile(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl('');
      setExifInfo(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  }

  const numericLat = latitude !== '' ? Number.parseFloat(latitude) : null;
  const numericLng = longitude !== '' ? Number.parseFloat(longitude) : null;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/80 px-4 py-3.5">
        <div>
          <h2 className="font-display text-[15px] font-semibold text-slate-100">
            Quick Geotagged Photo Upload
          </h2>
          <p className="text-[11px] text-slate-400">
            Just select a photo—GPS coordinates, nearest coastal sector, camera details, and timestamp are detected automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenPortal}
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-[11px] font-semibold text-slate-200 transition hover:border-teal-500/40 hover:text-teal-200"
        >
          Open Organisation Portal
        </button>
      </div>

      {createdReport && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/35 bg-emerald-950/35 px-4 py-3 text-[12px] text-emerald-200">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 size={18} className="shrink-0 text-emerald-400" />
            <span>
              Report <strong>#{createdReport.id}</strong> ({createdReport.title}) saved automatically with{' '}
              <strong>{createdReport.confidence_score}/100</strong> evidence score.
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenPortal}
            className="rounded-lg border border-emerald-400/35 bg-emerald-500/20 px-3 py-1.5 text-[11px] font-semibold text-emerald-100 transition hover:bg-emerald-500/30"
          >
            View in Organisation Portal
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-red-500/35 bg-red-950/40 px-4 py-3 text-[12px] text-red-200"
        >
          <AlertCircle size={17} className="mt-0.5 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5">
        {/* Step 1: Photo dropzone */}
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-700 bg-slate-950/60 p-6 text-center transition hover:border-teal-500/50">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            className="hidden"
          />
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Selected debris preview"
              className="max-h-60 w-auto rounded-lg border border-slate-800 object-contain"
            />
          ) : (
            <>
              <Upload size={26} className="text-teal-300" />
              <span className="text-[13px] font-semibold text-slate-100">
                Select or drop a geotagged photo (JPG, PNG, WEBP)
              </span>
              <span className="text-[11px] text-slate-400">
                EXIF GPS, camera model, dimensions, coastal sector, and timestamp are filled automatically.
              </span>
            </>
          )}
        </label>

        {detecting && (
          <p className="flex items-center gap-2 text-[12px] text-teal-300">
            <Loader2 size={14} className="animate-spin" />
            Extracting geotag and metadata from image...
          </p>
        )}

        {/* Auto-detected metadata preview */}
        {photoFile && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2.5 rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-semibold uppercase tracking-wider text-teal-300">
                  <Sparkles size={13} />
                  Auto-detected metadata
                </span>
                <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-300">
                  {gpsSource}
                </span>
              </div>

              <dl className="grid grid-cols-2 gap-2.5 pt-1 text-slate-300">
                <div>
                  <dt className="text-[10px] text-slate-500">Coordinates</dt>
                  <dd className="font-mono text-slate-100">
                    {numericLat !== null && numericLng !== null
                      ? `${numericLat.toFixed(5)}, ${numericLng.toFixed(5)}`
                      : 'Waiting for GPS / map click'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] text-slate-500">Coastal sector</dt>
                  <dd className="text-slate-100">{locationLabel || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[10px] text-slate-500">Timestamp</dt>
                  <dd className="font-mono text-slate-100">{capturedAt || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[10px] text-slate-500">Image / Camera</dt>
                  <dd className="text-slate-100">
                    {exifInfo
                      ? `${exifInfo.width}×${exifInfo.height} ${exifInfo.format}${
                          exifInfo.camera_make || exifInfo.camera_model
                            ? ` · ${[exifInfo.camera_make, exifInfo.camera_model].filter(Boolean).join(' ')}`
                            : ''
                        }`
                      : photoFile.name}
                  </dd>
                </div>
              </dl>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => tryDeviceGps(false)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-teal-500/30 bg-teal-500/10 px-2.5 py-1 text-[10px] font-semibold text-teal-200 transition hover:bg-teal-500/20"
                >
                  <Navigation size={11} />
                  Use device GPS
                </button>
                <span className="text-[10px] text-slate-500">
                  Or click anywhere on the map to adjust pin
                </span>
              </div>
            </div>

            <LocationPickerMap
              lat={numericLat}
              lng={numericLng}
              onPick={(pickedLat, pickedLng, source) => applyDetectedLocation(pickedLat, pickedLng, source)}
            />
          </div>
        )}

        {/* Collapsible optional details */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/40">
          <button
            type="button"
            onClick={() => setShowOptional((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-[11px] font-semibold text-slate-300 hover:text-white"
          >
            <span className="flex items-center gap-2">
              <Camera size={13} className="text-teal-300" />
              Optional details (auto-filled if left blank)
            </span>
            {showOptional ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>

          {showOptional && (
            <div className="space-y-3 border-t border-slate-800 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-300" htmlFor="rep-title">
                    Report title
                  </label>
                  <input
                    id="rep-title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Auto-generated from location"
                    className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950/80 px-3 text-[12px] text-slate-100 outline-none placeholder:text-slate-600 focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-300" htmlFor="rep-type">
                    Suspected debris category
                  </label>
                  <select
                    id="rep-type"
                    value={debrisType}
                    onChange={(e) => setDebrisType(e.target.value)}
                    className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950/80 px-3 text-[12px] text-slate-100 outline-none focus:border-teal-500"
                  >
                    {DEBRIS_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-300" htmlFor="rep-sev">
                    Severity
                  </label>
                  <select
                    id="rep-sev"
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value)}
                    className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950/80 px-3 text-[12px] text-slate-100 outline-none focus:border-teal-500"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-300" htmlFor="rep-qty">
                    Estimated quantity
                  </label>
                  <input
                    id="rep-qty"
                    type="text"
                    value={estimatedQuantity}
                    onChange={(e) => setEstimatedQuantity(e.target.value)}
                    placeholder="e.g. ~20 items"
                    className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950/80 px-3 text-[12px] text-slate-100 outline-none placeholder:text-slate-600 focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-300" htmlFor="rep-lat">
                    Lat / Lng (manual override)
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <input
                      id="rep-lat"
                      type="number"
                      step="any"
                      value={latitude}
                      onChange={(e) => {
                        setLatitude(e.target.value);
                        setGpsSource('manual');
                      }}
                      placeholder="Lat"
                      className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950/80 px-2 font-mono text-[11px] text-slate-100 outline-none focus:border-teal-500"
                    />
                    <input
                      type="number"
                      step="any"
                      value={longitude}
                      onChange={(e) => {
                        setLongitude(e.target.value);
                        setGpsSource('manual');
                      }}
                      placeholder="Lng"
                      className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950/80 px-2 font-mono text-[11px] text-slate-100 outline-none focus:border-teal-500"
                    />
                  </div>
                </div>
              </div>

              <div>
                <span className="mb-1.5 block text-[11px] font-medium text-slate-300">
                  Observed debris movement direction
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {COMPASS_8_POINTS.map((pt) => {
                    const selected = observedDirectionLabel === pt.label;
                    return (
                      <button
                        key={pt.label}
                        type="button"
                        onClick={() => {
                          if (selected) {
                            setObservedDirectionDeg('');
                            setObservedDirectionLabel('');
                          } else {
                            setObservedDirectionDeg(String(pt.deg));
                            setObservedDirectionLabel(pt.label);
                          }
                        }}
                        className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition ${
                          selected
                            ? 'border-teal-400/50 bg-teal-500/20 text-teal-200'
                            : 'border-slate-700 bg-slate-950/70 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {pt.label} ({pt.deg}°)
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-300" htmlFor="rep-notes">
                  Notes
                </label>
                <textarea
                  id="rep-notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional shoreline or tide context..."
                  className="w-full rounded-lg border border-slate-700 bg-slate-950/80 p-2.5 text-[12px] text-slate-100 outline-none placeholder:text-slate-600 focus:border-teal-500"
                />
              </div>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting || !photoFile}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-teal-400/35 bg-teal-500/20 text-[12px] font-semibold text-teal-100 transition hover:bg-teal-500/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Saving geotagged report...
            </>
          ) : (
            <>
              <MapPin size={16} />
              Submit geotagged photo
            </>
          )}
        </button>
      </form>
    </div>
  );
}
