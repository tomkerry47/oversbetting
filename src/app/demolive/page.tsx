'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import LiveKeyEvents from '@/components/LiveKeyEvents';
import LivePitch from '@/components/LivePitch';
import LiveStats from '@/components/LiveStats';
import LiveLineups from '@/components/LiveLineups';
import LiveMatchClock from '@/components/LiveMatchClock';
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
  second: number | null;
  clockUpdatedAt: number;
  status: string;
  liveWebsocket: boolean;
  websocketPlus: boolean;
  stats: Record<string, Pair>;
};
type DemoAlert = { id: string; matchId: number; title: string; detail: string };

function MatchModal({ match, detail, onClose, onMatchEvent }: { match: Match; detail: any; onClose: () => void; onMatchEvent: (event: any) => void }) {
  const stats = detail || match.stats || {};
  return (
    <div className="fixed inset-0 z-[80] bg-slate-950/90 p-0 backdrop-blur-sm sm:p-4" onMouseDown={onClose}>
      <div className="mx-auto flex h-[100dvh] w-full max-w-6xl flex-col overflow-hidden border-slate-600 bg-slate-900 shadow-2xl sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl sm:border" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
          <div><div className="text-[10px] uppercase tracking-widest text-red-400">BSD live preview</div><div className="text-sm font-bold text-white">{match.homeTeam} vs {match.awayTeam}</div></div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-slate-800 text-xl text-slate-300 hover:bg-slate-700" aria-label="Close match">×</button>
        </div>
        <div className="space-y-3 overflow-y-auto p-2 sm:space-y-4 sm:p-4">
          <section className="rounded-xl border border-slate-700 bg-slate-800/80 p-3 text-center shadow-lg sm:p-4">
            <div className="flex items-center justify-center gap-1.5 text-xs text-slate-400">
              <span>{match.league}</span>
              <span aria-hidden="true">·</span>
              <LiveMatchClock live={detail || match} fallbackStatus={match.status} className="font-bold text-emerald-400" />
            </div>
            <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-4"><div className="font-semibold text-white">{match.homeTeam}</div><div className="text-4xl font-black text-white">{detail?.homeScore ?? match.homeScore ?? 0}–{detail?.awayScore ?? match.awayScore ?? 0}</div><div className="font-semibold text-white">{match.awayTeam}</div></div>
            <LiveKeyEvents events={detail?.keyEvents} />
          </section>
          <LivePitch
            detail={detail}
            streamUrl={`/api/demolive/${match.id}/stream`}
            onMatchEvent={onMatchEvent}
            eventId={match.id}
            websocketPlus={Boolean(match.websocketPlus || detail?.websocketPlus)}
            matchStatus={detail?.status || match.status}
            homeTeam={match.homeTeam}
            awayTeam={match.awayTeam}
          />
          <LiveStats stats={stats} />
          <LiveLineups endpoint={`/api/demolive/${match.id}/lineups`} events={detail?.keyEvents || []} />
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
  const [alert, setAlert] = useState<DemoAlert | null>(null);
  const previousScores = useRef<Record<number, number>>({});
  const hasLoaded = useRef(false);

  const showAlert = useCallback((match: Match, test = false) => {
    const score = `${match.homeScore ?? 0}–${match.awayScore ?? 0}`;
    setAlert({
      id: `${match.id}-${score}-${Date.now()}`,
      matchId: match.id,
      title: `⚽ ${match.homeTeam} ${score} ${match.awayTeam}`,
      detail: test ? 'Test notification · click to open the live preview' : 'Live goal · click to open the match',
    });
  }, []);

  const loadMatches = useCallback(async () => {
    try {
      const response = await fetch('/api/demolive', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Live games request failed');
      const nextMatches: Match[] = body.matches || [];
      const nextScores: Record<number, number> = {};
      for (const match of nextMatches) {
        const score = Number(match.homeScore || 0) + Number(match.awayScore || 0);
        nextScores[match.id] = score;
        const previous = previousScores.current[match.id];
        if (hasLoaded.current && previous != null && score > previous) showAlert(match);
      }
      previousScores.current = nextScores;
      hasLoaded.current = true;
      setMatches(nextMatches); setError('');
    } catch (cause: any) { setError(cause.message); }
    finally { setLoading(false); }
  }, [showAlert]);

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
  useEffect(() => { if (!alert) return; const timer = window.setTimeout(() => setAlert(null), 15_000); return () => window.clearTimeout(timer); }, [alert]);
  useEffect(() => {
    if (!selectedId) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelectedId(null); };
    window.addEventListener('keydown', close); document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', close); document.body.style.overflow = ''; };
  }, [selectedId]);

  const selected = matches.find((match) => match.id === selectedId);
  return (
    <main className="mx-auto max-w-3xl space-y-5 px-0 py-5 pb-24">
      {alert && <button onClick={() => { setSelectedId(alert.matchId); setAlert(null); }} className="fixed right-3 top-3 z-[100] block w-[min(24rem,calc(100vw-1.5rem))] rounded-xl border border-emerald-500/60 bg-slate-900 p-3 text-left shadow-2xl transition hover:border-emerald-300 hover:bg-slate-800" aria-live="polite">
        <div className="text-sm font-bold text-white">{alert.title}</div>
        <div className="mt-1 text-xs text-emerald-300">{alert.detail}</div>
        <div className="mt-2 text-[10px] uppercase tracking-wide text-slate-400">Click to open match →</div>
      </button>}
      <header className="card"><div className="flex items-center justify-between gap-3"><div><div className="text-[10px] uppercase tracking-[.2em] text-red-400">Unlinked preview</div><h1 className="text-xl font-bold text-white">BSD Live Feed Demo</h1><p className="mt-1 text-xs text-slate-400">Click a current game to open its live match centre.</p></div><div className="flex shrink-0 flex-col items-end gap-2"><span className="rounded-full border border-red-500/40 bg-red-500/15 px-3 py-1 text-xs text-red-300">● LIVE</span><button disabled={matches.length === 0} onClick={() => showAlert(matches[0], true)} className="rounded-lg border border-emerald-600/50 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40">Test notification</button></div></div></header>
      {error && <div className="rounded-xl border border-red-700 bg-red-950/40 p-3 text-sm text-red-200">{error}</div>}
      <section className="card space-y-2">
        <h2 className="text-sm font-bold text-white">Current games ({matches.length})</h2>
        {loading && <p className="py-8 text-center text-sm text-slate-500">Loading BSD live games…</p>}
        {!loading && matches.length === 0 && <p className="py-8 text-center text-sm text-slate-500">BSD has no live games at the moment. Leave this page open and it will refresh.</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          {matches.map((match) => (
            <button key={match.id} onClick={() => setSelectedId(match.id)} className="rounded-xl border border-slate-700 bg-slate-800/50 p-3 text-left transition-colors hover:border-emerald-600 hover:bg-slate-800">
              <div className="flex justify-between gap-2 text-[10px] text-slate-400"><span className="truncate">{match.league}</span><LiveMatchClock live={match} fallbackStatus={match.status} className="font-bold text-emerald-400" /></div>
              <div className="mt-1 grid grid-cols-[1fr_auto] gap-2 text-sm text-white"><div><div>{match.homeTeam}</div><div>{match.awayTeam}</div></div><div className="text-right text-base font-bold"><div>{match.homeScore ?? '–'}</div><div>{match.awayScore ?? '–'}</div></div></div>
              <div className="mt-2 flex gap-1.5"><span className={`rounded px-1.5 py-0.5 text-[9px] ${match.websocketPlus ? 'bg-violet-500/20 text-violet-300' : 'bg-emerald-500/20 text-emerald-300'}`}>{match.websocketPlus ? 'WS+' : 'Basic'}</span><span className="ml-auto text-[10px] text-emerald-400">Open match →</span></div>
            </button>
          ))}
        </div>
      </section>
      {selected && <MatchModal key={selected.id} match={selected} detail={detail} onMatchEvent={(event) => setDetail((current: any) => mergeBsdLiveEvent(current, event))} onClose={() => { setSelectedId(null); setDetail(null); }} />}
    </main>
  );
}
