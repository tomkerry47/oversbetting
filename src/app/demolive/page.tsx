'use client';

import { useCallback, useEffect, useState } from 'react';
import LiveKeyEvents from '@/components/LiveKeyEvents';
import LivePitch from '@/components/LivePitch';
import LiveStats from '@/components/LiveStats';
import LiveLineups from '@/components/LiveLineups';
import { mergeBsdLiveEvent } from '@/lib/bsd-live-client';

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

function MatchModal({ match, detail, onClose, onMatchEvent }: { match: Match; detail: any; onClose: () => void; onMatchEvent: (event: any) => void }) {
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
            <LiveKeyEvents events={detail?.keyEvents} />
          </section>
          <LivePitch detail={detail} streamUrl={`/api/demolive/${match.id}/stream`} onMatchEvent={onMatchEvent} />
          <LiveStats stats={stats} />
          <LiveLineups endpoint={`/api/demolive/${match.id}/lineups`} />
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
              <div className="mt-2 flex gap-1.5"><span className={`rounded px-1.5 py-0.5 text-[9px] ${match.websocketPlus ? 'bg-violet-500/20 text-violet-300' : 'bg-emerald-500/20 text-emerald-300'}`}>{match.websocketPlus ? 'WS+' : 'Basic'}</span><span className="ml-auto text-[10px] text-emerald-400">Open match →</span></div>
            </button>
          ))}
        </div>
      </section>
      {selected && <MatchModal match={selected} detail={detail} onMatchEvent={(event) => setDetail((current: any) => mergeBsdLiveEvent(current, event))} onClose={() => { setSelectedId(null); setDetail(null); }} />}
    </main>
  );
}
