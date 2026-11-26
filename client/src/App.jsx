import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Anchor,
  Building2,
  Calendar,
  Camera,
  Clock3,
  Compass,
  Database,
  Filter,
  Layers,
  Loader2,
  LogIn,
  LogOut,
  Map,
  Navigation,
  RefreshCw,
  UserCheck,
  Waves,
  Wind,
} from 'lucide-react';
import DriftMap from './components/DriftMap.jsx';
import LoginPage from './components/LoginPage.jsx';
import ReportDebrisPage from './components/ReportDebrisPage.jsx';
import OrganisationPortal from './components/OrganisationPortal.jsx';
import { analyzePolygonOrientation, computeCandidateConfidence, formatArea } from './utils/geoMetrics.js';

const DATA_FILES = {
  metadata: '/data/metadata.json',
  red: '/data/red_small.geojson',
  yellow: '/data/yellow_small.geojson',
};

const AREA_FILTERS = [
  { label: 'All sizes', minSqM: 0 },
  { label: '≥ 1 ha', minSqM: 10000 },
  { label: '≥ 2 ha', minSqM: 20000 },
  { label: '≥ 5 ha', minSqM: 50000 },
];

const TOKEN_STORAGE_KEY = 'driftguard_token';

async function fetchDataFile(path, cacheBustValue) {
  const url = cacheBustValue ? `${path}?t=${cacheBustValue}` : path;
  const response = await fetch(url, { cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`Missing or unreadable file: ${path} (HTTP ${response.status})`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('text/html')) {
    throw new Error(`Missing data file: ${path}`);
  }

  return response.json();
}

function validateFeatureCollection(data, path) {
  if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
    throw new Error(`Invalid GeoJSON FeatureCollection in ${path}`);
  }
  return data;
}

function validateMetadata(data, path) {
  if (!data || typeof data !== 'object' || (!data.generated && !data.window && !data.source)) {
    throw new Error(`Invalid metadata fields in ${path}`);
  }
  return data;
}

function filterCollectionByArea(fc, minSqM) {
  if (!fc) return null;
  if (!minSqM) return fc;
  return {
    type: 'FeatureCollection',
    features: fc.features.filter((ft) => (ft?.properties?.area ?? 0) >= minSqM),
  };
}

function StatBadge({ label, value, icon: Icon, accentClass }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/80 px-3.5 py-3">
      <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border ${accentClass}`}>
        <Icon size={16} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[10px] font-semibold uppercase tracking-[0.09em] text-slate-400">
          {label}
        </p>
        <p className="mt-0.5 truncate text-[14px] font-semibold text-slate-100">{value}</p>
      </div>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState('map');
  const [authToken, setAuthToken] = useState(() => localStorage.getItem(TOKEN_STORAGE_KEY) || '');
  const [currentUser, setCurrentUser] = useState(null);
  const [pendingTab, setPendingTab] = useState('');

  const [metadata, setMetadata] = useState(null);
  const [redData, setRedData] = useState(null);
  const [yellowData, setYellowData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [dataVersion, setDataVersion] = useState(0);

  const [showRed, setShowRed] = useState(true);
  const [showYellow, setShowYellow] = useState(true);
  const [minAreaSqM, setMinAreaSqM] = useState(0);
  const [selectedFeature, setSelectedFeature] = useState(null);
  const [recenterToken, setRecenterToken] = useState(0);
  const [focusTarget, setFocusTarget] = useState(null);

  const [surfaceVector, setSurfaceVector] = useState(null);
  const [vectorLoading, setVectorLoading] = useState(false);
  const [vectorError, setVectorError] = useState('');

  useEffect(() => {
    if (!authToken) {
      setCurrentUser(null);
      return;
    }
    let cancelled = false;
    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (cancelled) return;
        if (body?.data) {
          setCurrentUser(body.data);
        } else {
          localStorage.removeItem(TOKEN_STORAGE_KEY);
          setAuthToken('');
          setCurrentUser(null);
        }
      })
      .catch(() => {
        if (!cancelled) setCurrentUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, [authToken]);

  const loadData = useCallback(async (isRefresh = false) => {
    const cacheBust = isRefresh ? Date.now() : null;
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const [metaRaw, redRaw, yellowRaw] = await Promise.all([
        fetchDataFile(DATA_FILES.metadata, cacheBust),
        fetchDataFile(DATA_FILES.red, cacheBust),
        fetchDataFile(DATA_FILES.yellow, cacheBust),
      ]);

      const parsedMeta = validateMetadata(metaRaw, DATA_FILES.metadata);
      const parsedRed = validateFeatureCollection(redRaw, DATA_FILES.red);
      const parsedYellow = validateFeatureCollection(yellowRaw, DATA_FILES.yellow);

      setMetadata(parsedMeta);
      setRedData(parsedRed);
      setYellowData(parsedYellow);
      setSelectedFeature(null);
      setSurfaceVector(null);
      setVectorError('');
      setDataVersion((v) => v + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load screening data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  const filteredRed = useMemo(() => filterCollectionByArea(redData, minAreaSqM), [redData, minAreaSqM]);
  const filteredYellow = useMemo(() => filterCollectionByArea(yellowData, minAreaSqM), [yellowData, minAreaSqM]);

  const topHotspots = useMemo(() => {
    const topRed = (filteredRed?.features ?? [])
      .slice()
      .sort((a, b) => (b?.properties?.area ?? 0) - (a?.properties?.area ?? 0))
      .slice(0, 4);
    const topYellow = (filteredYellow?.features ?? [])
      .slice()
      .sort((a, b) => (b?.properties?.area ?? 0) - (a?.properties?.area ?? 0))
      .slice(0, 4);
    return [...topRed, ...topYellow];
  }, [filteredRed, filteredYellow]);

  const selectedOrientation = useMemo(
    () => (selectedFeature ? analyzePolygonOrientation(selectedFeature) : null),
    [selectedFeature],
  );

  const selectedConfidence = useMemo(
    () => (selectedFeature ? computeCandidateConfidence(selectedFeature, selectedOrientation) : null),
    [selectedFeature, selectedOrientation],
  );

  const fetchSurfaceVector = useCallback(async (lat, lng) => {
    setVectorLoading(true);
    setVectorError('');
    try {
      const res = await fetch(`/api/environment/surface-vector?lat=${lat.toFixed(5)}&lng=${lng.toFixed(5)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.data) {
        throw new Error(body.detail || 'Live wind/current data unavailable.');
      }
      setSurfaceVector(body.data);
    } catch (err) {
      setSurfaceVector(null);
      setVectorError(err instanceof Error ? err.message : 'Could not fetch surface vector.');
    } finally {
      setVectorLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedOrientation?.centroid) {
      setSurfaceVector(null);
      setVectorError('');
      return;
    }
    fetchSurfaceVector(selectedOrientation.centroid.lat, selectedOrientation.centroid.lng);
  }, [fetchSurfaceVector, selectedOrientation]);

  function handleSelectHotspot(feature) {
    setSelectedFeature(feature);
    const info = analyzePolygonOrientation(feature);
    if (info?.centroid) {
      setFocusTarget({
        lat: info.centroid.lat,
        lng: info.centroid.lng,
        zoom: 13,
        token: Date.now(),
      });
    }
  }

  function navigateTo(tab) {
    if ((tab === 'report' || tab === 'portal') && !authToken) {
      setPendingTab(tab);
      setActiveTab('login');
      return;
    }
    setPendingTab('');
    setActiveTab(tab);
  }

  function handleAuthSuccess(token, user) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    setAuthToken(token);
    setCurrentUser(user);
    if (pendingTab) {
      setActiveTab(pendingTab);
      setPendingTab('');
    } else {
      setActiveTab(user.role === 'reporter' ? 'report' : 'portal');
    }
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setAuthToken('');
    setCurrentUser(null);
    if (activeTab === 'report' || activeTab === 'portal') {
      setActiveTab('login');
    }
  }

  const redCount = filteredRed ? filteredRed.features.length : null;
  const yellowCount = filteredYellow ? filteredYellow.features.length : null;
  const totalCount = redCount !== null && yellowCount !== null ? redCount + yellowCount : null;
  const selectedProps = selectedFeature?.properties ?? null;

  const directionOverlay = useMemo(() => {
    if (!selectedOrientation?.centroid) return null;
    return {
      lat: selectedOrientation.centroid.lat,
      lng: selectedOrientation.centroid.lng,
      axisDeg: selectedOrientation.axisDeg,
      axisLabel: selectedOrientation.axisLabel,
      bearingDeg: surfaceVector?.estimated_drift_direction_deg ?? null,
      compass: surfaceVector?.estimated_drift_compass ?? null,
    };
  }, [selectedOrientation, surfaceVector]);

  return (
    <div className="min-h-screen text-slate-100">
      <header className="border-b border-slate-800/90 bg-slate-950/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1740px] flex-wrap items-center justify-between gap-4 px-4 py-3.5 md:px-7">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-lg border border-teal-400/25 bg-teal-400/10 text-teal-300">
              <Anchor size={18} strokeWidth={1.8} />
            </span>
            <div>
              <h1 className="font-display text-[17px] font-bold leading-tight tracking-wide text-white">
                Drift<span className="text-teal-300">Guard</span>
              </h1>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                Karnataka Coast · Suspected Marine Litter Screening
              </p>
            </div>
          </div>

          <nav aria-label="Primary navigation" className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => navigateTo('map')}
              className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[11px] font-semibold transition ${
                activeTab === 'map'
                  ? 'bg-teal-500/20 text-teal-200 ring-1 ring-teal-500/40'
                  : 'text-slate-300 hover:bg-slate-900'
              }`}
            >
              <Map size={14} />
              Screening Map
            </button>
            <button
              type="button"
              onClick={() => navigateTo('report')}
              className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[11px] font-semibold transition ${
                activeTab === 'report'
                  ? 'bg-teal-500/20 text-teal-200 ring-1 ring-teal-500/40'
                  : 'text-slate-300 hover:bg-slate-900'
              }`}
            >
              <Camera size={14} />
              Report Debris
            </button>
            <button
              type="button"
              onClick={() => navigateTo('portal')}
              className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[11px] font-semibold transition ${
                activeTab === 'portal'
                  ? 'bg-teal-500/20 text-teal-200 ring-1 ring-teal-500/40'
                  : 'text-slate-300 hover:bg-slate-900'
              }`}
            >
              <Building2 size={14} />
              Organisation Portal
            </button>
          </nav>

          <div className="flex flex-wrap items-center gap-2.5 text-[11px]">
            {activeTab === 'map' && (
              <>
                <div className="hidden items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/80 px-2.5 py-1.5 xl:flex">
                  <Clock3 size={13} className="text-teal-300" />
                  <span className="text-slate-400">Data generated:</span>
                  <span className="font-mono text-slate-100">{metadata?.generated ?? '—'}</span>
                </div>
                <div className="hidden items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/80 px-2.5 py-1.5 2xl:flex">
                  <Calendar size={13} className="text-teal-300" />
                  <span className="text-slate-400">Window:</span>
                  <span className="font-medium text-slate-100">{metadata?.window ?? '—'}</span>
                </div>
                <div className="hidden items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/80 px-2.5 py-1.5 lg:flex">
                  <Layers size={13} className="text-teal-300" />
                  <span className="font-semibold text-red-300">
                    {redCount !== null ? redCount.toLocaleString() : '—'} red
                  </span>
                  <span className="text-slate-600">/</span>
                  <span className="font-semibold text-yellow-300">
                    {yellowCount !== null ? yellowCount.toLocaleString() : '—'} yellow
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => loadData(true)}
                  disabled={loading || refreshing}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-teal-500/30 bg-teal-500/10 px-3 text-[11px] font-semibold text-teal-200 transition hover:bg-teal-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
                  {refreshing ? 'Refreshing...' : 'Refresh data'}
                </button>
              </>
            )}

            {currentUser ? (
              <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/90 px-2.5 py-1.5">
                <UserCheck size={14} className="text-teal-300" />
                <span className="font-medium text-slate-100">{currentUser.name}</span>
                <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-teal-300">
                  {currentUser.role}
                </span>
                <button
                  type="button"
                  onClick={handleLogout}
                  title="Sign out"
                  className="ml-1 inline-flex items-center gap-1 text-slate-400 transition hover:text-red-300"
                >
                  <LogOut size={13} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setPendingTab('');
                  setActiveTab('login');
                }}
                className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[11px] font-semibold transition ${
                  activeTab === 'login'
                    ? 'border-teal-400/50 bg-teal-500/25 text-teal-100'
                    : 'border-slate-700 bg-slate-900 text-slate-100 hover:border-teal-500/40'
                }`}
              >
                <LogIn size={13} />
                Login
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1740px] space-y-4 px-4 pb-8 pt-5 md:px-7">
        {activeTab === 'login' && (
          <LoginPage
            onAuthSuccess={handleAuthSuccess}
            redirectMessage={
              pendingTab === 'report'
                ? 'Please sign in to upload a geotagged debris picture and metadata.'
                : pendingTab === 'portal'
                  ? 'Please sign in to view reported debris in the Organisation Portal.'
                  : ''
            }
          />
        )}

        {activeTab === 'report' && authToken && (
          <ReportDebrisPage token={authToken} onOpenPortal={() => navigateTo('portal')} />
        )}

        {activeTab === 'portal' && authToken && (
          <OrganisationPortal
            token={authToken}
            currentUser={currentUser}
            onOpenReportForm={() => navigateTo('report')}
          />
        )}

        {activeTab === 'map' && (
          <>
            <section className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
              <StatBadge
                label="Suspected marine litter (red)"
                value={redCount !== null ? redCount.toLocaleString() : '—'}
                icon={Layers}
                accentClass="border-red-500/25 bg-red-500/10 text-red-300"
              />
              <StatBadge
                label="Moderate candidates (yellow)"
                value={yellowCount !== null ? yellowCount.toLocaleString() : '—'}
                icon={Layers}
                accentClass="border-yellow-500/25 bg-yellow-500/10 text-yellow-300"
              />
              <StatBadge
                label="Displayed candidates"
                value={totalCount !== null ? totalCount.toLocaleString() : '—'}
                icon={Compass}
                accentClass="border-teal-500/25 bg-teal-500/10 text-teal-300"
              />
              <StatBadge
                label="Source"
                value={metadata?.source ?? '—'}
                icon={Database}
                accentClass="border-sky-500/25 bg-sky-500/10 text-sky-300"
              />
            </section>

            <section className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-xl border border-slate-800/80 bg-slate-900/50 px-4 py-2 text-[11px] text-slate-300 xl:hidden">
              <span>
                <strong className="text-slate-400">Data generated:</strong> {metadata?.generated ?? '—'}
              </span>
              <span>
                <strong className="text-slate-400">Window:</strong> {metadata?.window ?? '—'}
              </span>
            </section>

            {error && (
              <div
                role="alert"
                className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-red-500/35 bg-red-950/35 px-4 py-3.5 text-[12px] text-red-200"
              >
                <div className="flex items-start gap-2.5">
                  <AlertTriangle size={17} className="mt-0.5 shrink-0 text-red-400" />
                  <div>
                    <p className="font-semibold">Unable to load screening data</p>
                    <p className="mt-0.5 text-red-200/80">{error}</p>
                    <p className="mt-1 text-[11px] text-red-300/75">
                      Ensure <code className="rounded bg-slate-950/60 px-1 py-0.5">metadata.json</code>,{' '}
                      <code className="rounded bg-slate-950/60 px-1 py-0.5">red_small.geojson</code>, and{' '}
                      <code className="rounded bg-slate-950/60 px-1 py-0.5">yellow_small.geojson</code> exist in{' '}
                      <code className="rounded bg-slate-950/60 px-1 py-0.5">public/data/</code>.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => loadData(true)}
                  className="rounded-lg border border-red-400/30 bg-red-500/15 px-3 py-1.5 text-[11px] font-semibold text-red-100 transition hover:bg-red-500/25"
                >
                  Retry
                </button>
              </div>
            )}

            {loading && !redData && !yellowData ? (
              <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-8 text-center">
                <Loader2 size={26} className="animate-spin text-teal-300" />
                <p className="text-[13px] font-medium text-slate-200">
                  Loading suspected marine litter candidate layers...
                </p>
                <p className="text-[11px] text-slate-500">
                  Reading metadata.json, red_small.geojson, and yellow_small.geojson
                </p>
              </div>
            ) : (
              <section className="rounded-xl border border-slate-800 bg-slate-900/80 p-3.5 shadow-[0_16px_50px_rgba(0,0,0,0.22)] sm:p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-[14px] font-semibold text-slate-100">
                      Linked satellite &amp; candidate comparison
                    </h2>
                    <p className="text-[11px] text-slate-400">
                      Click any polygon or hotspot to inspect geometry orientation and live met-ocean transport direction.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950/80 p-1 text-[10px]">
                      <Filter size={11} className="mx-1 text-slate-400" />
                      {AREA_FILTERS.map((af) => (
                        <button
                          key={af.minSqM}
                          type="button"
                          onClick={() => setMinAreaSqM(af.minSqM)}
                          className={`rounded px-2 py-1 font-semibold transition ${
                            minAreaSqM === af.minSqM
                              ? 'bg-teal-500/20 text-teal-200'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {af.label}
                        </button>
                      ))}
                    </div>

                    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-950/80 px-2.5 py-1 text-[10px] font-medium text-slate-300">
                      <Waves size={12} className="text-teal-300" />
                      Drift forecasting: Planned (Phase 2)
                    </span>
                  </div>
                </div>

                <DriftMap
                  redData={filteredRed}
                  yellowData={filteredYellow}
                  showRed={showRed}
                  showYellow={showYellow}
                  onToggleRed={() => setShowRed((v) => !v)}
                  onToggleYellow={() => setShowYellow((v) => !v)}
                  selectedFeature={selectedFeature}
                  onSelectFeature={handleSelectHotspot}
                  recenterToken={recenterToken}
                  onRecenter={() => setRecenterToken((t) => t + 1)}
                  dataVersion={dataVersion}
                  focusTarget={focusTarget}
                  directionOverlay={directionOverlay}
                />
              </section>
            )}

            <section className="grid gap-3 xl:grid-cols-3">
              {/* Selected polygon + geometric orientation */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-300">
                    Selected candidate &amp; confidence
                  </h3>
                  {selectedConfidence && (
                    <span
                      className={`rounded-md border px-2 py-0.5 font-mono text-[11px] font-semibold ${
                        selectedConfidence.tier === 'High'
                          ? 'border-emerald-500/35 bg-emerald-500/15 text-emerald-200'
                          : selectedConfidence.tier === 'Moderate'
                            ? 'border-yellow-500/35 bg-yellow-500/15 text-yellow-200'
                            : 'border-slate-700 bg-slate-800 text-slate-300'
                      }`}
                    >
                      {selectedConfidence.score}/100 ({selectedConfidence.tier})
                    </span>
                  )}
                </div>
                {selectedProps && selectedOrientation && selectedConfidence ? (
                  <div className="mt-3 space-y-3 text-[12px]">
                    <dl className="grid grid-cols-2 gap-3">
                      <div>
                        <dt className="text-[10px] uppercase tracking-wider text-slate-500">Category</dt>
                        <dd className="mt-0.5 font-semibold text-slate-100">
                          {selectedProps.level === 'red' ? 'Suspected marine litter' : 'Moderate candidate'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase tracking-wider text-slate-500">Area</dt>
                        <dd className="mt-0.5 font-medium text-slate-200">{formatArea(selectedProps.area)}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase tracking-wider text-slate-500">Shape axis</dt>
                        <dd className="mt-0.5 font-mono text-sky-300">
                          {selectedOrientation.axisDeg}° ({selectedOrientation.axisLabel})
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase tracking-wider text-slate-500">Morphology</dt>
                        <dd className="mt-0.5 text-slate-200">
                          {selectedOrientation.morphology} ({selectedOrientation.elongationRatio}×)
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase tracking-wider text-slate-500">Pixel count</dt>
                        <dd className="mt-0.5 font-mono text-slate-200">{selectedProps.count ?? '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase tracking-wider text-slate-500">Nearest coast</dt>
                        <dd className="mt-0.5 text-slate-200">
                          {selectedOrientation.nearestCoast.distanceKm} km{' '}
                          {selectedOrientation.nearestCoast.bearingToCoastCompass} to{' '}
                          {selectedOrientation.nearestCoast.name}
                        </dd>
                      </div>
                    </dl>

                    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5 text-[10px]">
                      <p className="mb-1.5 font-semibold uppercase tracking-wider text-slate-400">
                        Rule-based screening score breakdown
                      </p>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-slate-300">
                        {selectedConfidence.breakdown.map((row) => (
                          <div key={row.label} className="flex items-center justify-between gap-2">
                            <span className="truncate text-slate-400">{row.label}</span>
                            <span className="font-mono text-teal-300">
                              {row.points}/{row.max}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-[11px] text-slate-500">
                    Click any polygon or hotspot cluster to view its rule-based confidence score, elongation axis, and
                    distance to the coast.
                  </p>
                )}
              </div>

              {/* Live surface drift direction (Open-Meteo) */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="flex items-center gap-1.5 font-display text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-300">
                    <Navigation size={13} className="text-teal-300" />
                    Estimated debris direction
                  </h3>
                  {selectedOrientation?.centroid && (
                    <button
                      type="button"
                      onClick={() =>
                        fetchSurfaceVector(selectedOrientation.centroid.lat, selectedOrientation.centroid.lng)
                      }
                      disabled={vectorLoading}
                      className="text-[10px] font-semibold text-teal-300 hover:text-teal-200"
                    >
                      {vectorLoading ? 'Fetching...' : 'Refresh vector'}
                    </button>
                  )}
                </div>

                {!selectedOrientation ? (
                  <p className="mt-2 text-[11px] text-slate-500">
                    Select a candidate polygon to fetch live Open-Meteo wind &amp; ocean current direction at its
                    centroid.
                  </p>
                ) : vectorLoading ? (
                  <div className="mt-3 flex items-center gap-2 text-[11px] text-teal-300">
                    <Loader2 size={14} className="animate-spin" />
                    Querying Open-Meteo wind &amp; ocean current...
                  </div>
                ) : vectorError ? (
                  <p className="mt-2 text-[11px] text-amber-300">{vectorError}</p>
                ) : surfaceVector ? (
                  <div className="mt-3 space-y-2.5 text-[11px]">
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-teal-500/25 bg-teal-500/10 px-3 py-2">
                      <div>
                        <span className="text-[10px] uppercase tracking-wider text-teal-300/80">
                          Transport heading
                        </span>
                        <p className="font-display text-[16px] font-bold text-white">
                          {surfaceVector.estimated_drift_direction_deg ?? '—'}°{' '}
                          {surfaceVector.estimated_drift_compass || ''}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] uppercase tracking-wider text-teal-300/80">Est. speed</span>
                        <p className="font-mono text-[13px] font-semibold text-teal-200">
                          {surfaceVector.estimated_drift_speed_ms} m/s ({surfaceVector.estimated_drift_speed_kmh} km/h)
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-slate-300">
                      <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2">
                        <span className="flex items-center gap-1 text-[10px] text-slate-500">
                          <Wind size={11} /> 10m Wind (toward)
                        </span>
                        <span className="font-mono text-slate-200">
                          {surfaceVector.wind_speed_ms ?? '—'} m/s · {surfaceVector.wind_toward_deg ?? '—'}°{' '}
                          {surfaceVector.wind_toward_compass || ''}
                        </span>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2">
                        <span className="flex items-center gap-1 text-[10px] text-slate-500">
                          <Waves size={11} /> Ocean Current
                        </span>
                        <span className="font-mono text-slate-200">
                          {surfaceVector.ocean_current_speed_ms ?? '—'} m/s · {surfaceVector.ocean_current_deg ?? '—'}°{' '}
                          {surfaceVector.ocean_current_compass || ''}
                        </span>
                      </div>
                    </div>

                    <p className="text-[11px] font-medium text-slate-200">
                      Coastal tendency: <span className="text-teal-300">{surfaceVector.coastal_tendency}</span>
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {surfaceVector.source} ({surfaceVector.observed_time}). Multi-day trajectory forecasting is Planned
                      (Phase 2).
                    </p>
                  </div>
                ) : null}
              </div>

              {/* Top hotspots jump list */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                <h3 className="font-display text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-300">
                  Largest candidate clusters ({topHotspots.length})
                </h3>
                {topHotspots.length > 0 ? (
                  <div className="mt-2.5 max-h-[190px] space-y-1.5 overflow-y-auto pr-1">
                    {topHotspots.map((ft, idx) => {
                      const props = ft.properties || {};
                      const isSel = selectedFeature === ft;
                      const conf = computeCandidateConfidence(ft);
                      return (
                        <button
                          key={ft.id ?? `${props.level}-${idx}`}
                          type="button"
                          onClick={() => handleSelectHotspot(ft)}
                          className={`flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left text-[11px] transition ${
                            isSel
                              ? 'border-teal-500/50 bg-teal-500/15'
                              : 'border-slate-800 bg-slate-950/50 hover:border-slate-700'
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <span
                              className={`h-2.5 w-2.5 rounded-sm ${
                                props.level === 'red' ? 'bg-red-500' : 'bg-yellow-400'
                              }`}
                            />
                            <span className="font-medium text-slate-200">
                              {props.level === 'red' ? 'Suspected litter' : 'Moderate candidate'}
                            </span>
                          </span>
                          <span className="flex items-center gap-2 font-mono text-[10px]">
                            <span className="text-teal-300">{conf.score}/100</span>
                            <span className="text-slate-400">{formatArea(props.area)}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-2 text-[11px] text-slate-500">No candidates match the selected size filter.</p>
                )}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
