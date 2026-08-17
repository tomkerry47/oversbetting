'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type Pair = { home: number | null; away: number | null };
type Match = {
  id: number;
  league: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  minute: number | null;
  status: string;
  liveWebsocket: boolean;
  websocketPlus: boolean;
  stats: Record<string, Pair>;
};

type PitchPoint = { x: number; y: number; item: any };

function actionLabel(item: any) {
  const minute = item.minute ?? item.min ?? item.time?.minute;
  const action = item.commentary || item.description || item.text || item.action_type || item.action || item.situation || item.type || 'Update';
  const player = item.player?.name || item.player_name;
  return `${minute != null ? `${minute}' ` : ''}${String(action).replaceAll('_', ' ')}${player ? ` · ${player}` : ''}`;
}

function eventMinute(event: any) {
  if (event.minute == null) return '–';
  return `${event.minute}${event.addedTime ? `+${event.addedTime}` : ''}′`;
}

function itemTeam(item: any): string | null {
  if (!item) return null;
  return item.team || item.side || (item.home === true ? 'home' : item.home === false ? 'away' : null);
}

function pitchPoint(item: any): PitchPoint | null {
  const raw = item?.coordinates?.at?.(-1) || item?.pos || item;
  const rawX = raw?.x ?? raw?.coordinate_x;
  const rawY = raw?.y ?? raw?.coordinate_y;
  if (rawX == null || rawY == null) return null;
  return {
    x: Math.max(2, Math.min(98, Number(rawX))),
    y: Math.max(2, Math.min(98, 100 - Number(rawY))),
    item,
  };
}

function StatRow({ label, home, away, suffix = '' }: { label: string; home: number | null; away: number | null; suffix?: string }) {
  if (home == null && away == null) return null;
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-sm">
      <span className="font-bold text-white">{home ?? '–'}{home != null ? suffix : ''}</span>
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-right font-bold text-white">{away ?? '–'}{away != null ? suffix : ''}</span>
    </div>
  );
}

function LivePitch({ detail }: { detail: any }) {
  const pitchItems = useMemo(
    () => [...(detail?.actions || []), ...(detail?.shotmap || [])].filter((item: any) => pitchPoint(item)),
    [detail]
  );
  const latest = pitchItems.at(-1);
  const latestTeam = itemTeam(latest);
  const sameTeam = latestTeam ? pitchItems.filter((item: any) => itemTeam(item) === latestTeam) : pitchItems;
  const passes = sameTeam.filter((item: any) => String(item.action_type || item.action || '').toLowerCase().includes('pass'));
  const trailSource = passes.length >= 2 ? passes : sameTeam;
  const trail = trailSource.slice(-3).map(pitchPoint).filter(Boolean) as PitchPoint[];
  const colour = latestTeam === 'away' ? '#f472b6' : '#fcd34d';

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-white">Live pitch</h2>
        {latestTeam && <span className="text-[10px] uppercase text-slate-400">{latestTeam} trail</span>}
      </div>
      <div className="relative aspect-[1.55] overflow-hidden rounded-xl border-2 border-white/60 bg-emerald-700">
        <div className="absolute inset-y-0 left-1/2 border-l border-white/60" />
        <div className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/60" />
        <div className="absolute inset-y-[22%] left-0 w-[16%] border border-l-0 border-white/60" />
        <div className="absolute inset-y-[22%] right-0 w-[16%] border border-r-0 border-white/60" />
        {trail.length > 0 ? (
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            {trail.slice(1).map((point, index) => {
              const previous = trail[index];
              return <line key={`line-${index}`} x1={previous.x} y1={previous.y} x2={point.x} y2={point.y} stroke={colour} strokeWidth="0.9" strokeDasharray="2 1" opacity={0.35 + index * 0.3} />;
            })}
            {trail.map((point, index) => (
              <circle key={`point-${index}`} cx={point.x} cy={point.y} r={index === trail.length - 1 ? 2.1 : 1.5} fill={colour} stroke="white" strokeWidth="0.6" opacity={0.3 + (index + 1) * (0.7 / trail.length)} />
            ))}
          </svg>
        ) : <div className="absolute inset-0 grid place-items-center text-xs text-emerald-100">Waiting for positioned actions…</div>}
      </div>
      <div className="mt-2 text-xs text-slate-400">{latest ? `Latest: ${actionLabel(latest)}` : 'WS+ coordinates will appear here when available.'}</div>
    </div>
  );
}

function MatchModal({ match, detail, onClose }: { match: Match; detail: any; onClose: () => void }) {
  const actions = useMemo(
    () => [...(detail?.incidents || []), ...(detail?.actions || [])].slice(-100).reverse(),
    [detail]
  );
  const stats = detail || match.stats || {};
  return (
    <div className="fixed inset-0 z-[80] bg-slate-950/80 p-2 backdrop-blur-sm sm:p-5" onMouseDown={onClose}>
      <div className="mx-auto flex max-h-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-600 bg-slate-900 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
          <div><div className="text-[10px] uppercase tracking-widest text-red-400">BSD live preview</div><div className="text-sm font-bold text-white">{match.homeTeam} vs {match.awayTeam}</div></div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-slate-800 text-xl text-slate-300 hover:bg-slate-700" aria-label="Close match">×</button>
        </div>
        <div className="space-y-4 overflow-y-auto p-4">
          <section className="card text-center">
            <div className="text-xs text-slate-400">{match.league} · {detail?.minute ?? match.minute ?? '–'}&apos;</div>
            <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-4"><div className="font-semibold text-white">{match.homeTeam}</div><div className="text-4xl font-black text-white">{detail?.homeScore ?? match.homeScore ?? 0}–{detail?.awayScore ?? match.awayScore ?? 0}</div><div className="font-semibold text-white">{match.awayTeam}</div></div>
          </section>
          <LivePitch detail={detail} />
          {detail?.keyEvents?.length > 0 && <div className="card">
            <h2 className="mb-3 text-sm font-bold text-white">Key events</h2>
            <div className="space-y-2">{detail.keyEvents.map((event: any) => <div key={event.id} className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-2 rounded-lg bg-slate-800/60 px-3 py-2 text-sm">
              <span className="font-bold text-emerald-400">{eventMinute(event)}</span>
              <span className="text-slate-200">{event.type === 'goal' ? '⚽' : event.type === 'red-card' ? '🟥' : event.type === 'yellow-card' ? '🟨' : event.type === 'substitution' ? '🔁' : 'VAR'} {event.player || 'Match update'}{event.assist ? <span className="text-xs text-slate-400"> · assist {event.assist}</span> : null}</span>
              {event.homeScore != null && event.awayScore != null && <span className="font-bold text-white">{event.homeScore}–{event.awayScore}</span>}
            </div>)}</div>
          </div>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="card">
              <h2 className="mb-3 text-sm font-bold text-white">Match statistics</h2>
              <div className="space-y-2">
                <StatRow label="Shots on target" home={stats.homeShotsOnTarget ?? stats.shotsOnTarget?.home} away={stats.awayShotsOnTarget ?? stats.shotsOnTarget?.away} />
                <StatRow label="Total shots" home={stats.homeShots ?? stats.shots?.home} away={stats.awayShots ?? stats.shots?.away} />
                <StatRow label={detail?.xgEstimated ? 'xG (estimated)' : 'xG'} home={stats.homeXg ?? stats.xg?.home} away={stats.awayXg ?? stats.xg?.away} />
                <StatRow label="Possession" home={stats.homePossession ?? stats.possession?.home} away={stats.awayPossession ?? stats.possession?.away} suffix="%" />
                <StatRow label="Corners" home={stats.homeCorners ?? stats.corners?.home} away={stats.awayCorners ?? stats.corners?.away} />
              </div>
            </div>
            <div className="card">
              <h2 className="mb-3 text-sm font-bold text-white">Available feed</h2>
              <div className="space-y-2 text-xs text-slate-300">
                <div className="flex justify-between"><span>Score and clock</span><span className="text-emerald-400">Yes</span></div>
                <div className="flex justify-between"><span>Live statistics</span><span className="text-emerald-400">Yes</span></div>
                <div className="flex justify-between"><span>Pitch coordinates</span><span className={match.websocketPlus ? 'text-emerald-400' : 'text-amber-400'}>{match.websocketPlus ? 'WS+' : 'Basic only'}</span></div>
                <div className="flex justify-between"><span>Incidents/commentary</span><span className="text-emerald-400">Yes</span></div>
              </div>
            </div>
          </div>
          <div className="card">
            <h2 className="mb-3 text-sm font-bold text-white">Live commentary / actions</h2>
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {actions.map((item: any, index: number) => <div key={item.id || item.ts || index} className="border-l-2 border-emerald-500 py-1 pl-3 text-sm text-slate-200">{actionLabel(item)}</div>)}
              {actions.length === 0 && <p className="py-4 text-center text-sm text-slate-500">Waiting for commentary…</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DemoLivePage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadMatches = useCallback(async () => {
    try {
      const response = await fetch('/api/demolive', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Live games request failed');
      setMatches(body.matches || []); setError('');
    } catch (cause: any) { setError(cause.message); }
    finally { setLoading(false); }
  }, []);

  const loadDetail = useCallback(async () => {
    if (!selectedId) return;
    try {
      const response = await fetch(`/api/demolive/${selectedId}`, { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Match feed request failed');
      setDetail(body.live); setError('');
    } catch (cause: any) { setError(cause.message); }
  }, [selectedId]);

  useEffect(() => { loadMatches(); const timer = setInterval(loadMatches, 30_000); return () => clearInterval(timer); }, [loadMatches]);
  useEffect(() => { if (!selectedId) return; setDetail(null); loadDetail(); const timer = setInterval(loadDetail, 10_000); return () => clearInterval(timer); }, [loadDetail, selectedId]);
  useEffect(() => {
    if (!selectedId) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelectedId(null); };
    window.addEventListener('keydown', close); document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', close); document.body.style.overflow = ''; };
  }, [selectedId]);

  const selected = matches.find((match) => match.id === selectedId);
  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-5 pb-24">
      <header className="card"><div className="flex items-center justify-between gap-3"><div><div className="text-[10px] uppercase tracking-[.2em] text-red-400">Unlinked preview</div><h1 className="text-xl font-bold text-white">BSD Live Feed Demo</h1><p className="mt-1 text-xs text-slate-400">Click a current game to open its live match centre.</p></div><span className="rounded-full border border-red-500/40 bg-red-500/15 px-3 py-1 text-xs text-red-300">● LIVE</span></div></header>
      {error && <div className="rounded-xl border border-red-700 bg-red-950/40 p-3 text-sm text-red-200">{error}</div>}
      <section className="card space-y-2">
        <h2 className="text-sm font-bold text-white">Current games ({matches.length})</h2>
        {loading && <p className="py-8 text-center text-sm text-slate-500">Loading BSD live games…</p>}
        {!loading && matches.length === 0 && <p className="py-8 text-center text-sm text-slate-500">BSD has no live games at the moment. Leave this page open and it will refresh.</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          {matches.map((match) => (
            <button key={match.id} onClick={() => setSelectedId(match.id)} className="rounded-xl border border-slate-700 bg-slate-800/50 p-3 text-left transition-colors hover:border-emerald-600 hover:bg-slate-800">
              <div className="flex justify-between gap-2 text-[10px] text-slate-400"><span className="truncate">{match.league}</span><span>{match.minute != null ? `${match.minute}'` : match.status}</span></div>
              <div className="mt-1 grid grid-cols-[1fr_auto] gap-2 text-sm text-white"><div><div>{match.homeTeam}</div><div>{match.awayTeam}</div></div><div className="text-right text-base font-bold"><div>{match.homeScore ?? '–'}</div><div>{match.awayScore ?? '–'}</div></div></div>
              <div className="mt-2 flex gap-1.5"><span className={`rounded px-1.5 py-0.5 text-[9px] ${match.liveWebsocket ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-700 text-slate-400'}`}>WS</span>{match.websocketPlus && <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[9px] text-violet-300">WS+</span>}<span className="ml-auto text-[10px] text-emerald-400">Open match →</span></div>
            </button>
          ))}
        </div>
      </section>
      {selected && <MatchModal match={selected} detail={detail} onClose={() => { setSelectedId(null); setDetail(null); }} />}
    </main>
  );
}
