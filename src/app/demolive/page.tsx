'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

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
  stats: Record<string, { home: number | null; away: number | null }>;
};

function actionLabel(item: any) {
  const minute = item.minute ?? item.time?.minute;
  const action = item.commentary || item.description || item.text || item.action_type || item.action || item.situation || item.type || 'Update';
  const player = item.player?.name || item.player_name;
  return `${minute != null ? `${minute}' ` : ''}${String(action).replaceAll('_', ' ')}${player ? ` · ${player}` : ''}`;
}

function StatRow({ label, home, away, suffix = '' }: { label: string; home: number | null; away: number | null; suffix?: string }) {
  if (home == null && away == null) return null;
  return <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-sm"><span className="font-bold text-white">{home ?? '–'}{home != null ? suffix : ''}</span><span className="text-xs text-slate-400">{label}</span><span className="text-right font-bold text-white">{away ?? '–'}{away != null ? suffix : ''}</span></div>;
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
      setMatches(body.matches || []);
      setSelectedId((current) => current ?? body.matches?.[0]?.id ?? null);
      setError('');
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
  useEffect(() => { setDetail(null); loadDetail(); const timer = setInterval(loadDetail, 10_000); return () => clearInterval(timer); }, [loadDetail]);

  const selected = matches.find((match) => match.id === selectedId);
  const actions = useMemo(() => [...(detail?.incidents || []), ...(detail?.actions || [])].slice(-100).reverse(), [detail]);
  const pitchItems = useMemo(() => [...(detail?.actions || []), ...(detail?.shotmap || [])].filter((item: any) => item?.x != null || item?.coordinate_x != null || item?.coordinates?.[0]), [detail]);
  const latest = pitchItems.at(-1);
  const point = latest?.coordinates?.at?.(-1) || latest;
  const x = Math.max(2, Math.min(98, Number(point?.x ?? point?.coordinate_x ?? 50)));
  const y = Math.max(2, Math.min(98, Number(point?.y ?? point?.coordinate_y ?? 50)));
  const stats = detail || selected?.stats || {};

  return <main className="max-w-5xl mx-auto px-4 py-5 pb-24 space-y-5">
    <header className="card"><div className="flex items-center justify-between gap-3"><div><div className="text-[10px] uppercase tracking-[.2em] text-red-400">Unlinked preview</div><h1 className="text-xl font-bold text-white">BSD Live Feed Demo</h1><p className="mt-1 text-xs text-slate-400">Current BSD matches · list refreshes every 30s · selected feed every 10s</p></div><span className="rounded-full bg-red-500/15 border border-red-500/40 px-3 py-1 text-xs text-red-300">● LIVE</span></div></header>
    {error && <div className="rounded-xl border border-red-700 bg-red-950/40 p-3 text-sm text-red-200">{error}</div>}
    <div className="grid lg:grid-cols-[320px_1fr] gap-5 items-start">
      <section className="card space-y-2"><h2 className="text-sm font-bold text-white">Current games ({matches.length})</h2>{loading && <p className="py-8 text-center text-sm text-slate-500">Loading BSD live games…</p>}{!loading && matches.length === 0 && <p className="py-8 text-center text-sm text-slate-500">BSD has no live games at the moment. Leave this page open and it will refresh.</p>}{matches.map((match) => <button key={match.id} onClick={() => setSelectedId(match.id)} className={`w-full rounded-xl border p-3 text-left transition-colors ${selectedId === match.id ? 'border-emerald-500 bg-emerald-950/30' : 'border-slate-700 bg-slate-800/50 hover:bg-slate-800'}`}><div className="flex justify-between gap-2 text-[10px] text-slate-400"><span className="truncate">{match.league}</span><span>{match.minute != null ? `${match.minute}'` : match.status}</span></div><div className="mt-1 grid grid-cols-[1fr_auto] gap-2 text-sm text-white"><div><div>{match.homeTeam}</div><div>{match.awayTeam}</div></div><div className="text-right text-base font-bold"><div>{match.homeScore ?? '–'}</div><div>{match.awayScore ?? '–'}</div></div></div><div className="mt-2 flex gap-1.5"><span className={`rounded px-1.5 py-0.5 text-[9px] ${match.liveWebsocket ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-700 text-slate-400'}`}>WS</span>{match.websocketPlus && <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[9px] text-violet-300">WS+</span>}</div></button>)}</section>
      <section className="space-y-4">{!selected ? <div className="card py-20 text-center text-slate-500">Select a live match to inspect its feed.</div> : <>
        <div className="card text-center"><div className="text-xs text-slate-400">{selected.league} · {detail?.minute ?? selected.minute ?? '–'}&apos;</div><div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-4"><div className="font-semibold text-white">{selected.homeTeam}</div><div className="text-4xl font-black text-white">{detail?.homeScore ?? selected.homeScore ?? 0}–{detail?.awayScore ?? selected.awayScore ?? 0}</div><div className="font-semibold text-white">{selected.awayTeam}</div></div></div>
        <div className="card"><h2 className="text-sm font-bold text-white mb-3">Live pitch</h2><div className="relative aspect-[1.55] overflow-hidden rounded-xl border-2 border-white/60 bg-emerald-700"><div className="absolute inset-y-0 left-1/2 border-l border-white/60"/><div className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/60"/><div className="absolute inset-y-[22%] left-0 w-[16%] border border-l-0 border-white/60"/><div className="absolute inset-y-[22%] right-0 w-[16%] border border-r-0 border-white/60"/>{latest ? <div className="absolute -ml-2 -mt-2 h-4 w-4 animate-pulse rounded-full border-2 border-white bg-amber-300 shadow-lg" style={{ left: `${x}%`, top: `${100-y}%` }} title={actionLabel(latest)}/> : <div className="absolute inset-0 grid place-items-center text-xs text-emerald-100">Waiting for a positioned action…</div>}</div><div className="mt-2 text-xs text-slate-400">{latest ? `Latest: ${actionLabel(latest)}` : 'WS+ coordinates will appear here when available.'}</div></div>
        <div className="grid sm:grid-cols-2 gap-4"><div className="card"><h2 className="mb-3 text-sm font-bold text-white">Match statistics</h2><div className="space-y-2"><StatRow label="Shots on target" home={stats.homeShotsOnTarget ?? stats.shotsOnTarget?.home} away={stats.awayShotsOnTarget ?? stats.shotsOnTarget?.away}/><StatRow label="Total shots" home={stats.homeShots ?? stats.shots?.home} away={stats.awayShots ?? stats.shots?.away}/><StatRow label="xG" home={stats.homeXg ?? stats.xg?.home} away={stats.awayXg ?? stats.xg?.away}/><StatRow label="Possession" home={stats.homePossession ?? stats.possession?.home} away={stats.awayPossession ?? stats.possession?.away} suffix="%"/><StatRow label="Corners" home={stats.homeCorners ?? stats.corners?.home} away={stats.awayCorners ?? stats.corners?.away}/></div></div><div className="card"><h2 className="mb-3 text-sm font-bold text-white">Available feed</h2><div className="space-y-2 text-xs text-slate-300"><div className="flex justify-between"><span>Score and clock</span><span className="text-emerald-400">Yes</span></div><div className="flex justify-between"><span>Live statistics</span><span className="text-emerald-400">Yes</span></div><div className="flex justify-between"><span>Pitch coordinates</span><span className={selected.websocketPlus ? 'text-emerald-400' : 'text-amber-400'}>{selected.websocketPlus ? 'WS+' : 'Basic only'}</span></div><div className="flex justify-between"><span>Incidents/commentary</span><span className="text-emerald-400">Yes</span></div></div></div></div>
        <div className="card"><h2 className="mb-3 text-sm font-bold text-white">Live commentary / actions</h2><div className="max-h-96 space-y-2 overflow-y-auto">{actions.map((item: any, index: number) => <div key={item.id || item.ts || index} className="border-l-2 border-emerald-500 py-1 pl-3 text-sm text-slate-200">{actionLabel(item)}</div>)}{actions.length === 0 && <p className="py-4 text-center text-sm text-slate-500">Waiting for commentary…</p>}</div></div>
      </>}</section>
    </div>
  </main>;
}

