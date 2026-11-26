import { Fragment, useCallback, useEffect, useState } from 'react';
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip } from 'react-leaflet';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Download,
  Loader2,
  MapPin,
  Navigation,
  PlusCircle,
  RefreshCw,
  Search,
  User,
} from 'lucide-react';
import { KARNATAKA_COAST_STATIONS, projectEndpoint } from '../utils/geoMetrics.js';

const SATELLITE_TILE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const LABELS_TILE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';

const STATUS_STYLES = {
  reported: {
    label: 'Reported',
    color: '#ef4444',
    badge: 'border-red-500/35 bg-red-500/15 text-red-200',
  },
  under_review: {
    label: 'Under review',
    color: '#eab308',
    badge: 'border-yellow-500/35 bg-yellow-500/15 text-yellow-200',
  },
  cleared: {
    label: 'Cleared',
    color: '#10b981',
    badge: 'border-emerald-500/35 bg-emerald-500/15 text-emerald-200',
  },
};

const ORG_ROLES = new Set(['organisation', 'analyst', 'admin']);

export default function OrganisationPortal({ token, currentUser, onOpenReportForm }) {
  const [portalData, setPortalData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);
  const [reportVector, setReportVector] = useState(null);
  const [vectorLoading, setVectorLoading] = useState(false);
  const [vectorError, setVectorError] = useState('');

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`/api/field-reports?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.detail || 'Could not load reported debris.');
      }

      setPortalData(body.data);
      setSelectedId((prev) => {
        const items = body.data?.items || [];
        if (items.some((i) => i.id === prev)) return prev;
        return items[0]?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load portal data.');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, token]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  async function handleStatusChange(reportId, nextStatus) {
    setUpdatingId(reportId);
    setError('');
    try {
      const res = await fetch(`/api/field-reports/${reportId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: nextStatus }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.detail || 'Failed to update status.');
      }
      await loadReports();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Status update failed.');
    } finally {
      setUpdatingId(null);
    }
  }

  const items = portalData?.items ?? [];
  const selectedReport = items.find((r) => r.id === selectedId) ?? items[0] ?? null;
  const statusCounts = portalData?.status_counts ?? { reported: 0, under_review: 0, cleared: 0 };
  const categoryCounts = portalData?.category_counts ?? {};
  const canModerate = ORG_ROLES.has(currentUser?.role);

  useEffect(() => {
    setReportVector(null);
    setVectorError('');
  }, [selectedReport?.id]);

  async function handleCheckDirection(report) {
    setVectorLoading(true);
    setVectorError('');
    try {
      const res = await fetch(
        `/api/environment/surface-vector?lat=${report.latitude.toFixed(5)}&lng=${report.longitude.toFixed(5)}`,
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.data) {
        throw new Error(body.detail || 'Live wind/current data unavailable.');
      }
      setReportVector(body.data);
    } catch (err) {
      setReportVector(null);
      setVectorError(err instanceof Error ? err.message : 'Direction check failed.');
    } finally {
      setVectorLoading(false);
    }
  }

  function downloadExport(format) {
    if (!items.length) return;
    let content = '';
    let mime = 'text/plain;charset=utf-8';
    let filename = `driftguard_reports.${format}`;

    if (format === 'geojson') {
      const fc = {
        type: 'FeatureCollection',
        features: items.map((r) => ({
          type: 'Feature',
          id: r.id,
          geometry: { type: 'Point', coordinates: [r.longitude, r.latitude] },
          properties: {
            id: r.id,
            title: r.title,
            debris_type: r.debris_type,
            severity: r.severity,
            status: r.status,
            estimated_quantity: r.estimated_quantity,
            location_label: r.location_label,
            captured_at: r.captured_at,
            observed_direction_deg: r.observed_direction_deg,
            observed_direction_label: r.observed_direction_label,
            confidence_score: r.confidence_score,
            confidence_tier: r.confidence_tier,
            reporter_name: r.reporter_name,
            gps_source: r.gps_source,
          },
        })),
      };
      content = JSON.stringify(fc, null, 2);
      mime = 'application/geo+json;charset=utf-8';
    } else {
      const headers = [
        'id', 'title', 'debris_type', 'severity', 'status',
        'confidence_score', 'confidence_tier',
        'latitude', 'longitude', 'gps_source', 'location_label',
        'estimated_quantity', 'observed_direction_deg', 'observed_direction_label',
        'captured_at', 'reporter_name', 'reporter_email',
      ];
      const escapeCsv = (val) => `"${String(val ?? '').replaceAll('"', '""')}"`;
      const rows = items.map((r) => headers.map((h) => escapeCsv(r[h])).join(','));
      content = [headers.join(','), ...rows].join('\n');
      mime = 'text/csv;charset=utf-8';
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/80 px-4 py-3.5">
        <div>
          <h2 className="font-display text-[15px] font-semibold text-slate-100">
            Organisation Portal · Field Debris Reports
          </h2>
          <p className="text-[11px] text-slate-400">
            Total reported geotagged observations, embedded EXIF metadata, and review tracking.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!items.length}
            onClick={() => downloadExport('csv')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-[11px] font-semibold text-slate-200 transition hover:border-teal-500/40 disabled:opacity-50"
          >
            <Download size={13} />
            Export CSV
          </button>
          <button
            type="button"
            disabled={!items.length}
            onClick={() => downloadExport('geojson')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-[11px] font-semibold text-slate-200 transition hover:border-teal-500/40 disabled:opacity-50"
          >
            <Download size={13} />
            Export GeoJSON
          </button>
          <button
            type="button"
            onClick={loadReports}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-[11px] font-semibold text-slate-200 transition hover:border-teal-500/40"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            type="button"
            onClick={onOpenReportForm}
            className="inline-flex items-center gap-1.5 rounded-lg border border-teal-500/35 bg-teal-500/15 px-3 py-1.5 text-[11px] font-semibold text-teal-200 transition hover:bg-teal-500/25"
          >
            <PlusCircle size={13} />
            Add geotagged report
          </button>
        </div>
      </div>

      {/* Summary counts */}
      <section className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 px-4 py-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.09em] text-slate-400">
            Total debris reported
          </p>
          <p className="mt-1 font-display text-[24px] font-bold text-white">
            {portalData ? portalData.total_reported : '—'}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 px-4 py-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.09em] text-red-300">Reported (new)</p>
          <p className="mt-1 font-display text-[24px] font-bold text-red-200">
            {portalData ? statusCounts.reported : '—'}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 px-4 py-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.09em] text-yellow-300">Under review</p>
          <p className="mt-1 font-display text-[24px] font-bold text-yellow-200">
            {portalData ? statusCounts.under_review : '—'}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 px-4 py-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.09em] text-emerald-300">Cleared</p>
          <p className="mt-1 font-display text-[24px] font-bold text-emerald-200">
            {portalData ? statusCounts.cleared : '—'}
          </p>
        </div>
      </section>

      {Object.keys(categoryCounts).length > 0 && (
        <section className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-2.5 text-[11px]">
          <span className="font-semibold text-slate-400">By category:</span>
          {Object.entries(categoryCounts).map(([cat, count]) => (
            <span
              key={cat}
              className="rounded-md border border-slate-700 bg-slate-950/70 px-2.5 py-1 text-slate-200"
            >
              {cat}: <strong className="text-teal-300">{count}</strong>
            </span>
          ))}
        </section>
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

      {loading && !portalData ? (
        <div className="flex min-h-[260px] items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-900/70 text-[12px] text-slate-300">
          <Loader2 size={18} className="animate-spin text-teal-300" />
          Loading reported debris...
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
          {/* Left list + filters */}
          <aside className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/80">
            <div className="space-y-2.5 border-b border-slate-800 p-3.5">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search title, location, reporter..."
                  className="h-9 w-full rounded-lg border border-slate-800 bg-slate-950/80 pl-9 pr-3 text-[11px] text-slate-100 outline-none placeholder:text-slate-600 focus:border-teal-500"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {['all', 'reported', 'under_review', 'cleared'].map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`rounded-md px-2.5 py-1 text-[10px] font-semibold transition ${
                      statusFilter === st
                        ? 'bg-teal-500/20 text-teal-200 ring-1 ring-teal-500/40'
                        : 'bg-slate-950/60 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {st === 'all' ? 'All' : STATUS_STYLES[st].label}
                  </button>
                ))}
              </div>
            </div>

            <div className="max-h-[540px] flex-1 space-y-1.5 overflow-y-auto p-3">
              {items.length === 0 ? (
                <div className="py-10 text-center text-[12px] text-slate-500">
                  No debris reports match this view yet.
                </div>
              ) : (
                items.map((item) => {
                  const st = STATUS_STYLES[item.status] || STATUS_STYLES.reported;
                  const active = selectedReport?.id === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className={`w-full rounded-lg border p-3 text-left transition ${
                        active
                          ? 'border-teal-500/50 bg-teal-950/25'
                          : 'border-slate-800/80 bg-slate-950/50 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="line-clamp-1 text-[12px] font-semibold text-slate-100">
                          #{item.id} · {item.title}
                        </span>
                        <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-semibold ${st.badge}`}>
                          {st.label}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-400">{item.debris_type}</p>
                      <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-500">
                        <span className="flex items-center gap-1">
                          <MapPin size={10} />
                          {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="font-mono text-teal-300">{item.confidence_score}/100</span>
                          <span>{item.reporter_name}</span>
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          {/* Right detail + geotagged map */}
          <section className="space-y-4">
            <div className="h-[260px] overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
              <MapContainer
                center={
                  selectedReport
                    ? [selectedReport.latitude, selectedReport.longitude]
                    : [13.15, 74.57]
                }
                zoom={selectedReport ? 11 : 9}
                scrollWheelZoom
                className="h-full w-full"
              >
                <TileLayer attribution="Tiles &copy; Esri" url={SATELLITE_TILE_URL} />
                <TileLayer attribution="Labels &copy; Esri" url={LABELS_TILE_URL} />
                {KARNATAKA_COAST_STATIONS.map((st) => (
                  <CircleMarker
                    key={`portal-st-${st.name}`}
                    center={[st.lat, st.lng]}
                    radius={3}
                    pathOptions={{ color: '#e2e8f0', fillColor: '#0f172a', fillOpacity: 0.9, weight: 1 }}
                  >
                    <Tooltip permanent direction="right" offset={[6, 0]} className="coastal-label">
                      {st.name}
                    </Tooltip>
                  </CircleMarker>
                ))}
                {items.map((item) => {
                  const st = STATUS_STYLES[item.status] || STATUS_STYLES.reported;
                  const isSel = selectedReport?.id === item.id;
                  const activeBearing =
                    isSel && reportVector?.estimated_drift_direction_deg != null
                      ? reportVector.estimated_drift_direction_deg
                      : item.observed_direction_deg;
                  const tip =
                    typeof activeBearing === 'number'
                      ? projectEndpoint(item.latitude, item.longitude, activeBearing, 2.5)
                      : null;
                  return (
                    <Fragment key={item.id}>
                      <CircleMarker
                        center={[item.latitude, item.longitude]}
                        radius={isSel ? 10 : 7}
                        pathOptions={{
                          color: isSel ? '#ffffff' : st.color,
                          fillColor: st.color,
                          fillOpacity: 0.9,
                          weight: isSel ? 2.5 : 1.5,
                        }}
                        eventHandlers={{ click: () => setSelectedId(item.id) }}
                      >
                        <Tooltip direction="top">
                          <strong>#{item.id}</strong> · {item.title}
                        </Tooltip>
                      </CircleMarker>
                      {tip && (
                        <Polyline
                          positions={[
                            [item.latitude, item.longitude],
                            tip,
                          ]}
                          pathOptions={{ color: '#2dd4bf', weight: 3, opacity: 0.95 }}
                        >
                          <Tooltip sticky>
                            Heading: {activeBearing}°
                          </Tooltip>
                        </Polyline>
                      )}
                    </Fragment>
                  );
                })}
              </MapContainer>
            </div>

            {selectedReport ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] text-teal-300">#{selectedReport.id}</span>
                      <h3 className="font-display text-[15px] font-semibold text-white">
                        {selectedReport.title}
                      </h3>
                      <span
                        className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${
                          (STATUS_STYLES[selectedReport.status] || STATUS_STYLES.reported).badge
                        }`}
                      >
                        {(STATUS_STYLES[selectedReport.status] || STATUS_STYLES.reported).label}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {selectedReport.debris_type} · Severity:{' '}
                      <strong className="text-slate-200">{selectedReport.severity}</strong> · Evidence score:{' '}
                      <strong className="font-mono text-teal-300">
                        {selectedReport.confidence_score}/100 ({selectedReport.confidence_tier})
                      </strong>
                    </p>
                  </div>

                  {canModerate ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {['reported', 'under_review', 'cleared'].map((st) => (
                        <button
                          key={st}
                          type="button"
                          disabled={updatingId === selectedReport.id || selectedReport.status === st}
                          onClick={() => handleStatusChange(selectedReport.id, st)}
                          className={`rounded-lg border px-2.5 py-1 text-[10px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                            selectedReport.status === st
                              ? 'border-teal-400/40 bg-teal-500/20 text-teal-200'
                              : 'border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-500'
                          }`}
                        >
                          {STATUS_STYLES[st].label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span className="text-[10px] text-slate-500">
                      Status changes require an Organisation account
                    </span>
                  )}
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-[260px_minmax(0,1fr)]">
                  <a
                    href={selectedReport.image_url}
                    target="_blank"
                    rel="noreferrer"
                    className="group block overflow-hidden rounded-xl border border-slate-800 bg-slate-950"
                  >
                    <img
                      src={selectedReport.image_url}
                      alt={selectedReport.title}
                      className="h-52 w-full object-cover transition group-hover:scale-[1.02]"
                    />
                    <span className="block border-t border-slate-800 px-3 py-1.5 text-center text-[10px] text-teal-300">
                      Open full-resolution geotagged image
                    </span>
                  </a>

                  <div className="space-y-3 text-[12px]">
                    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      <div>
                        <dt className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500">
                          <MapPin size={10} /> Coordinates
                        </dt>
                        <dd className="mt-0.5 font-mono text-slate-100">
                          {selectedReport.latitude.toFixed(5)}, {selectedReport.longitude.toFixed(5)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase tracking-wider text-slate-500">GPS Source</dt>
                        <dd className="mt-0.5 font-medium text-slate-200">{selectedReport.gps_source}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase tracking-wider text-slate-500">Location Label</dt>
                        <dd className="mt-0.5 text-slate-200">{selectedReport.location_label || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase tracking-wider text-slate-500">Est. Quantity</dt>
                        <dd className="mt-0.5 text-slate-200">{selectedReport.estimated_quantity || '—'}</dd>
                      </div>
                      <div>
                        <dt className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500">
                          <Clock3 size={10} /> Captured
                        </dt>
                        <dd className="mt-0.5 font-mono text-[11px] text-slate-200">
                          {selectedReport.captured_at || '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500">
                          <User size={10} /> Reporter
                        </dt>
                        <dd className="mt-0.5 text-slate-200">{selectedReport.reporter_name}</dd>
                      </div>
                      <div>
                        <dt className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500">
                          <Navigation size={10} /> Observed Dir.
                        </dt>
                        <dd className="mt-0.5 font-mono text-teal-300">
                          {selectedReport.observed_direction_deg != null
                            ? `${selectedReport.observed_direction_deg}° ${selectedReport.observed_direction_label || ''}`
                            : '—'}
                        </dd>
                      </div>
                    </dl>

                    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          <Navigation size={11} className="text-teal-300" />
                          Live Wind &amp; Ocean Current Direction
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCheckDirection(selectedReport)}
                          disabled={vectorLoading}
                          className="rounded border border-teal-500/35 bg-teal-500/15 px-2.5 py-1 text-[10px] font-semibold text-teal-200 transition hover:bg-teal-500/25 disabled:opacity-50"
                        >
                          {vectorLoading ? 'Checking...' : 'Check debris direction'}
                        </button>
                      </div>
                      {vectorError && <p className="mt-1.5 text-[11px] text-amber-300">{vectorError}</p>}
                      {reportVector && (
                        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate-200">
                          <span>
                            Transport heading:{' '}
                            <strong className="text-teal-300">
                              {reportVector.estimated_drift_direction_deg ?? '—'}°{' '}
                              {reportVector.estimated_drift_compass || ''}
                            </strong>
                          </span>
                          <span>Speed: {reportVector.estimated_drift_speed_kmh} km/h</span>
                          <span>Tendency: {reportVector.coastal_tendency}</span>
                        </div>
                      )}
                    </div>

                    {selectedReport.confidence_breakdown && (
                      <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-[11px]">
                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          Evidence confidence breakdown ({selectedReport.confidence_score}/100)
                        </p>
                        <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
                          {selectedReport.confidence_breakdown.map((row) => (
                            <div key={row.label} className="flex items-center justify-between gap-2 text-slate-300">
                              <span className="text-slate-400">{row.label}</span>
                              <span className="font-mono text-teal-300">
                                {row.points}/{row.max}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedReport.notes && (
                      <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                        <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          <ClipboardList size={11} /> Observer notes
                        </p>
                        <p className="mt-1 text-[12px] text-slate-200">{selectedReport.notes}</p>
                      </div>
                    )}

                    {selectedReport.exif_metadata && (
                      <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-[11px] text-slate-300">
                        <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          <Camera size={11} /> Image &amp; EXIF Metadata
                        </p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          <span>File: {selectedReport.exif_metadata.filename || '—'}</span>
                          <span>
                            Dimensions: {selectedReport.exif_metadata.width || '?'}×
                            {selectedReport.exif_metadata.height || '?'} ({selectedReport.exif_metadata.format || '—'})
                          </span>
                          {(selectedReport.exif_metadata.camera_make || selectedReport.exif_metadata.camera_model) && (
                            <span>
                              Camera:{' '}
                              {[
                                selectedReport.exif_metadata.camera_make,
                                selectedReport.exif_metadata.camera_model,
                              ]
                                .filter(Boolean)
                                .join(' ')}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-6 text-[12px] text-slate-400">
                <CheckCircle2 size={16} className="text-slate-500" />
                No reports submitted yet. Use &ldquo;Add geotagged report&rdquo; to submit the first observation.
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
