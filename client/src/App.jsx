import { useMemo, useState } from 'react';
import {
  Activity,
  Anchor,
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  Bell,
  ChevronDown,
  CircleDot,
  Clock3,
  Compass,
  Fish,
  MapPin,
  Radio,
  Search,
  ShieldCheck,
  Waves,
  Wind,
  X,
} from 'lucide-react';
import DriftMap from './components/DriftMap.jsx';
import { incidentColors, mockIncidents } from './data/mockIncidents.js';

const roles = ['Reporter', 'Analyst', 'Coordinator'];
const filters = ['All signals', 'Ghost net', 'Plastic cluster', 'Drifting buoy'];

function formatCount(count) {
  return String(count).padStart(2, '0');
}

function KpiCard({ label, value, icon: Icon, tone, trend, trendLabel }) {
  return (
    <div className="group flex min-w-0 items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/80 px-3.5 py-3.5 shadow-[0_8px_28px_rgba(0,0,0,0.12)] transition-colors hover:border-slate-700 sm:px-4">
      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg border ${tone}`}>
        <Icon size={17} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[10px] font-semibold uppercase tracking-[0.09em] text-slate-400 sm:text-[11px]">{label}</p>
        <div className="mt-0.5 flex items-baseline gap-2">
          <p className="font-display text-[22px] font-semibold leading-none text-slate-100">{formatCount(value)}</p>
          <span className="hidden items-center gap-0.5 text-[10px] font-medium text-slate-500 xl:inline-flex">
            {trend === 'up' ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {trendLabel}
          </span>
        </div>
      </div>
    </div>
  );
}

function SignalRow({ incident, selected, onClick }) {
  const recovered = incident.status === 'Picked up';
  const color = recovered ? '#64748b' : incidentColors[incident.type] ?? '#2dd4bf';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg border px-3 py-3 text-left transition ${selected ? 'border-teal-500/40 bg-teal-950/25' : 'border-transparent bg-slate-950/40 hover:border-slate-700 hover:bg-slate-800/70'}`}
    >
      <span className="flex items-start gap-3">
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full shadow-[0_0_10px_currentColor]" style={{ color, backgroundColor: color }} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className="truncate text-[12px] font-semibold text-slate-200">{incident.type}</span>
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${recovered ? 'bg-slate-800 text-slate-400' : incident.status === 'Review' ? 'bg-amber-400/10 text-amber-300' : 'bg-teal-400/10 text-teal-300'}`}>
              {incident.status}
            </span>
          </span>
          <span className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-slate-500">
            <span className="flex min-w-0 items-center gap-1 truncate"><MapPin size={11} />{incident.place}</span>
            <span className="shrink-0">{incident.lastSeen}</span>
          </span>
          <span className="mt-1.5 block text-[10px] font-medium text-slate-600">{incident.id} <span className="px-1 text-slate-700">/</span> {incident.confidence}% confidence</span>
        </span>
      </span>
    </button>
  );
}

export default function App() {
  const [incidents, setIncidents] = useState(mockIncidents);
  const [selectedId, setSelectedId] = useState(mockIncidents[0].id);
  const [role, setRole] = useState('Analyst');
  const [filter, setFilter] = useState('All signals');
  const [query, setQuery] = useState('');
  const [recenterToken, setRecenterToken] = useState(0);
  const [notice, setNotice] = useState('');

  const selectedIncident = incidents.find((incident) => incident.id === selectedId) ?? incidents[0];
  const counts = {
    active: incidents.filter((incident) => incident.status !== 'Picked up').length,
    ghostNets: incidents.filter((incident) => incident.type === 'Ghost net' && incident.status !== 'Picked up').length,
    review: incidents.filter((incident) => incident.status === 'Review').length,
    recovered: incidents.filter((incident) => incident.status === 'Picked up').length,
  };

  const visibleIncidents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return incidents.filter((incident) => {
      const matchesFilter = filter === 'All signals' || incident.type === filter;
      const matchesQuery = !normalizedQuery || `${incident.id} ${incident.type} ${incident.place} ${incident.status}`.toLowerCase().includes(normalizedQuery);
      return matchesFilter && matchesQuery;
    });
  }, [filter, incidents, query]);

  function markPickedUp() {
    if (!selectedIncident || selectedIncident.status === 'Picked up') return;
    setIncidents((current) => current.map((incident) => (
      incident.id === selectedIncident.id ? { ...incident, status: 'Picked up', driftDistance: 'Recovered' } : incident
    )));
    setNotice(`${selectedIncident.id} marked as recovered`);
    window.setTimeout(() => setNotice(''), 3200);
  }

  return (
    <div className="min-h-screen text-slate-100">
      <header className="border-b border-slate-800/90 bg-slate-950/80 backdrop-blur-xl">
        <div className="mx-auto flex min-h-[68px] max-w-[1740px] items-center justify-between gap-4 px-4 md:px-7">
          <a href="#main" className="flex shrink-0 items-center gap-2.5" aria-label="DriftGuard home">
            <span className="relative grid h-9 w-9 place-items-center rounded-lg border border-teal-400/20 bg-teal-400/10 text-teal-300">
              <Anchor size={19} strokeWidth={1.8} />
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-slate-950 bg-emerald-400" />
            </span>
            <span>
              <span className="block font-display text-[16px] font-bold leading-tight tracking-wide text-white">Drift<span className="text-teal-300">Guard</span></span>
              <span className="mt-0.5 block text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">Marine operations</span>
            </span>
          </a>

          <div className="hidden items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-1.5 lg:flex">
            <span className="relative flex h-2 w-2"><span className="absolute h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" /><span className="relative h-2 w-2 rounded-full bg-emerald-400" /></span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-emerald-300">Systems nominal</span>
            <span className="mx-1 h-3 w-px bg-slate-700" />
            <span className="font-mono text-[10px] text-slate-400">13.34°N 74.74°E</span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500 sm:block">Workspace</span>
            <div className="relative">
              <select
                aria-label="Switch role"
                value={role}
                onChange={(event) => setRole(event.target.value)}
                className="h-9 appearance-none rounded-lg border border-slate-700 bg-slate-900 py-0 pl-3 pr-8 text-[11px] font-semibold text-slate-200 outline-none transition focus:border-teal-500"
              >
                {roles.map((item) => <option key={item}>{item}</option>)}
              </select>
              <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            </div>
            <button type="button" title="Notifications" aria-label="Notifications" className="relative grid h-9 w-9 place-items-center rounded-lg border border-slate-800 bg-slate-900 text-slate-400 transition hover:border-slate-700 hover:text-slate-100">
              <Bell size={16} />
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-rose-400" />
            </button>
            <span className="hidden h-8 w-px bg-slate-800 sm:block" />
            <span className="hidden text-right sm:block">
              <span className="block text-[11px] font-semibold text-slate-200">West Coast Cell</span>
              <span className="block text-[9px] text-slate-500">Karnataka, IN</span>
            </span>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-[1740px] px-4 pb-8 pt-5 md:px-7 md:pt-7">
        <section className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="mb-1.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-teal-300/80"><Waves size={13} /> Coastal watch / Malpe sector</div>
            <h1 className="font-display text-[23px] font-semibold tracking-tight text-slate-100 sm:text-[26px]">Marine overview</h1>
            <p className="mt-1 text-[11px] text-slate-500">Live debris intelligence and drift forecasts along the Karnataka coast.</p>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-[10px] text-slate-400">
            <Clock3 size={13} className="text-slate-500" /> Updated just now <span className="mx-0.5 h-3 w-px bg-slate-700" /> UTC+5:30
          </div>
        </section>

        <section aria-label="Incident summary" className="mb-5 grid grid-cols-2 gap-2.5 xl:grid-cols-4 xl:gap-3">
          <KpiCard label="Active debris" value={counts.active} icon={Activity} tone="border-teal-400/15 bg-teal-400/[0.07] text-teal-300" trend="up" trendLabel="2 new" />
          <KpiCard label="Ghost nets" value={counts.ghostNets} icon={Fish} tone="border-rose-400/15 bg-rose-400/[0.07] text-rose-300" trend="up" trendLabel="1 new" />
          <KpiCard label="Review queue" value={counts.review} icon={Search} tone="border-amber-400/15 bg-amber-400/[0.07] text-amber-300" trend="down" trendLabel="1 cleared" />
          <KpiCard label="Picked up" value={counts.recovered} icon={BadgeCheck} tone="border-sky-400/15 bg-sky-400/[0.07] text-sky-300" trend="up" trendLabel="today" />
        </section>

        <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_350px]">
          <div className="min-w-0 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/80 shadow-[0_16px_50px_rgba(0,0,0,0.22)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3.5 sm:px-5">
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-lg border border-slate-700 bg-slate-800/70 text-teal-300"><Compass size={16} /></span>
                <div>
                  <h2 className="font-display text-[13px] font-semibold text-slate-100">Drift intelligence map</h2>
                  <p className="mt-0.5 text-[10px] text-slate-500">Malpe coastal sector · 48-hour forecast</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-slate-500"><Radio size={13} className="text-emerald-400" /> AIS + coastal watch online</div>
            </div>
            <div className="h-[420px] p-2.5 sm:h-[520px] sm:p-3">
              <DriftMap
                incidents={incidents}
                selectedIncident={selectedIncident}
                onSelect={(incident) => setSelectedId(incident.id)}
                recenterToken={recenterToken}
                onRecenter={() => setRecenterToken((token) => token + 1)}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 px-4 py-2.5 text-[10px] text-slate-500 sm:px-5">
              <span className="flex items-center gap-1.5"><Wind size={12} /> SW monsoon · 14 kn</span>
              <span className="flex items-center gap-1.5"><Waves size={12} /> Sea state 2 · 0.8 m</span>
              <span className="font-mono">Forecast model v2.4.1</span>
            </div>
          </div>

          <aside className="flex min-w-0 flex-col gap-4">
            <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/80">
              <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3.5">
                <div className="flex items-center gap-2"><ShieldCheck size={15} className="text-teal-300" /><h2 className="font-display text-[13px] font-semibold text-slate-100">Selected signal</h2></div>
                <span className="rounded border border-slate-700 bg-slate-950/70 px-2 py-1 font-mono text-[9px] text-slate-400">{selectedIncident?.id ?? '—'}</span>
              </div>
              {selectedIncident ? (
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-9 w-9 place-items-center rounded-lg border" style={{ color: incidentColors[selectedIncident.type], borderColor: `${incidentColors[selectedIncident.type]}35`, backgroundColor: `${incidentColors[selectedIncident.type]}12` }}><CircleDot size={17} /></span>
                      <div><p className="text-[12px] font-semibold text-slate-100">{selectedIncident.type}</p><p className="mt-0.5 text-[10px] text-slate-500">{selectedIncident.debris}</p></div>
                    </div>
                    <span className={`rounded px-1.5 py-1 text-[9px] font-semibold uppercase tracking-wide ${selectedIncident.severity === 'Critical' || selectedIncident.severity === 'High' ? 'bg-rose-400/10 text-rose-300' : 'bg-amber-400/10 text-amber-300'}`}>{selectedIncident.severity}</span>
                  </div>
                  <p className="mt-3 text-[11px] leading-relaxed text-slate-400">{selectedIncident.description}</p>
                  <div className="my-3 grid grid-cols-2 gap-2 border-y border-slate-800 py-3">
                    <div><p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-600">48h drift</p><p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-slate-200"><ArrowUpRight size={12} className="text-teal-300" />{selectedIncident.driftDistance}</p></div>
                    <div><p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-600">Confidence</p><p className="mt-1 text-[11px] font-semibold text-slate-200">{selectedIncident.confidence}% <span className="text-[9px] font-normal text-slate-500">model</span></p></div>
                    <div><p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-600">Last position</p><p className="mt-1 flex items-center gap-1 text-[10px] text-slate-300"><MapPin size={11} className="text-slate-500" />{selectedIncident.place}</p></div>
                    <div><p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-600">Reported</p><p className="mt-1 text-[10px] text-slate-300">{selectedIncident.lastSeen}</p></div>
                  </div>
                  <button
                    type="button"
                    onClick={markPickedUp}
                    disabled={selectedIncident.status === 'Picked up'}
                    className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-teal-500/25 bg-teal-500/10 text-[11px] font-semibold text-teal-200 transition hover:border-teal-400/50 hover:bg-teal-500/15 disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-slate-950/50 disabled:text-slate-500"
                  >
                    <BadgeCheck size={14} />{selectedIncident.status === 'Picked up' ? 'Recovered' : 'Mark as picked up'}
                  </button>
                </div>
              ) : <p className="p-4 text-[11px] text-slate-500">Select a signal to inspect its forecast.</p>}
            </section>

            <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/80">
              <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-4 py-3.5">
                <div className="flex items-center gap-2"><Activity size={15} className="text-sky-300" /><h2 className="font-display text-[13px] font-semibold text-slate-100">Recent signals</h2><span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-semibold text-slate-400">{visibleIncidents.length}</span></div>
                <button type="button" className="text-[10px] font-medium text-teal-300 transition hover:text-teal-200" onClick={() => { setFilter('All signals'); setQuery(''); }}>Reset</button>
              </div>
              <div className="space-y-2 p-3">
                <label className="relative block">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search signals" aria-label="Search signals" className="h-9 w-full rounded-lg border border-slate-800 bg-slate-950/70 pl-9 pr-8 text-[11px] text-slate-200 outline-none placeholder:text-slate-600 focus:border-slate-600" />
                  {query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200"><X size={13} /></button>}
                </label>
                <div className="flex gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none]">
                  {filters.map((item) => <button key={item} type="button" onClick={() => setFilter(item)} className={`shrink-0 rounded-md px-2 py-1.5 text-[9px] font-semibold transition ${filter === item ? 'bg-slate-700 text-slate-100' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'}`}>{item}</button>)}
                </div>
                <div className="max-h-[242px] space-y-1.5 overflow-y-auto pr-0.5">
                  {visibleIncidents.length ? visibleIncidents.map((incident) => (
                    <SignalRow key={incident.id} incident={incident} selected={selectedIncident?.id === incident.id} onClick={() => setSelectedId(incident.id)} />
                  )) : <p className="px-3 py-6 text-center text-[11px] text-slate-500">No signals match this view.</p>}
                </div>
              </div>
              <div className="flex items-center gap-2 border-t border-slate-800 px-4 py-2.5 text-[9px] text-slate-500"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Sync complete <span className="ml-auto">{incidents.length} reports loaded</span></div>
            </section>
          </aside>
        </section>

        <footer className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/70 pt-3 text-[9px] text-slate-600">
          <span className="flex items-center gap-1.5"><Anchor size={11} /> DriftGuard Coastal Intelligence</span>
          <span className="flex items-center gap-3"><span>Data: Coastal Watch Network</span><span>Forecast horizon: 48 hours</span><span className="hidden sm:inline">Role: {role}</span></span>
        </footer>
      </main>

      {notice && <div role="status" className="fixed bottom-5 left-1/2 z-[1000] flex -translate-x-1/2 items-center gap-2 rounded-lg border border-emerald-500/25 bg-slate-900 px-4 py-3 text-[11px] font-medium text-emerald-200 shadow-xl"><BadgeCheck size={15} />{notice}</div>}
    </div>
  );
}
