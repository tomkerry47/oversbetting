'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import LiveMatchClock from '@/components/LiveMatchClock';
import { mergeBsdLiveEvent } from '@/lib/bsd-live-client';

type LiveAlert = { id: string; fixtureId: string; title: string; detail: string };

function isFinishedMatch(row: any) {
  const status = String(row.live?.status || row.fixture?.match_status || '')
    .toLowerCase()
    .replaceAll('_', '')
    .replaceAll(' ', '');
  return ['finished', 'ft', 'ended'].includes(status);
}

function MatchCard({ row }: { row: any }) {
  const fixture = row.fixture;
  const storedStats = fixture.final_stats || {};
  const stat = (key: string) => row.live?.[key] ?? storedStats[key] ?? null;
  const goals = Number(fixture.home_score || 0) + Number(fixture.away_score || 0);
  const isBsd = fixture.data_provider === 'bsd';
  const status = String(row.live?.status || fixture.match_status || '').toLowerCase().replaceAll('_', '');
  const isLost = isFinishedMatch(row) && goals < 3;
  const hasStarted = goals > 0 || [
    'live', 'inprogress', '1sthalf', '2ndhalf', 'halftime', 'paused',
    'extratime', 'penalties', 'finished', 'ft', 'ended',
  ].includes(status);
  return (
    <Link href={isBsd ? `/live/${fixture.id}` : '#'} className={`block card !p-2.5 sm:!p-3 ${isBsd ? 'active:scale-[.99]' : ''}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-emerald-500/50 bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-300">
              {row.player_name}&apos;s pick
            </span>
            <span className="text-[10px] uppercase tracking-wide text-slate-400">
              {fixture.league_name}{!isBsd ? ' · 10 min updates' : ''}
            </span>
          </div>
          <div className="text-sm font-semibold text-white truncate">
            {fixture.home_team} <span className="text-slate-500">v</span> {fixture.away_team}
          </div>
          {isBsd && hasStarted && (
            <div className="mt-1 flex gap-3 text-[11px] text-slate-300">
              <span>Shots on target {stat('homeShotsOnTarget') ?? '–'}–{stat('awayShotsOnTarget') ?? '–'}</span>
              <span>xG {stat('homeXg')?.toFixed?.(2) ?? '–'}–{stat('awayXg')?.toFixed?.(2) ?? '–'}</span>
            </div>
          )}
        </div>
        <div className="text-right shrink-0">
          <LiveMatchClock live={row.live} fallbackStatus={fixture.match_status} kickOff={fixture.kick_off} className="mb-0.5 block text-xs font-bold text-emerald-400" />
          <div className="text-2xl font-black text-white">{fixture.home_score ?? 0}–{fixture.away_score ?? 0}</div>
          <div className={goals >= 3 ? 'text-emerald-400 text-xs font-bold' : isLost ? 'text-red-400 text-xs font-bold' : 'text-amber-300 text-xs'}>
            {goals >= 3 ? 'WON ✓' : isLost ? 'LOST ✕' : `${Math.min(goals, 3)}/3 goals`}
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function LivePage() {
  const [data, setData] = useState<any>({ matches: [], goals: 0, target: 24 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [alerts, setAlerts] = useState<LiveAlert[]>([]);
  const previousScores = useRef<Record<string, number>>({});
  const wonFixtures = useRef<Set<string>>(new Set());
  const hasLoaded = useRef(false);
  const requestInFlight = useRef(false);
  const lastFullRefresh = useRef(0);
  const load = useCallback(async (forceFull = false) => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setRefreshing(true);
    try {
      const fullRefresh = forceFull || !hasLoaded.current || Date.now() - lastFullRefresh.current >= 60_000;
      const response = await fetch(fullRefresh ? '/api/live' : '/api/live/scores', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Live refresh failed');
      if (fullRefresh) lastFullRefresh.current = Date.now();
      const nextScores: Record<string, number> = {};
      const processedFixtures = new Set<string>();
      for (const row of body.matches || []) {
        const fixture = row.fixture;
        const fixtureId = String(fixture.id);
        const receivedScore = Number(fixture.home_score || 0) + Number(fixture.away_score || 0);
        const previous = previousScores.current[fixtureId];
        const score = row.live || previous == null ? receivedScore : previous;
        nextScores[fixtureId] = score;
        if (processedFixtures.has(fixtureId)) continue;
        processedFixtures.add(fixtureId);
        const alreadyWon = wonFixtures.current.has(fixtureId) || Number(previous) >= 3;
        if (hasLoaded.current && !alreadyWon && fixture.data_provider === 'bsd' && previous != null && score > previous) {
          let scorer = 'Goal scored';
          let minute = row.live?.minute != null ? `${row.live.minute}′` : 'Live';
          try {
            const detailResponse = await fetch(`/api/live/${fixtureId}`, { cache: 'no-store' });
            const matchDetail = await detailResponse.json();
            const goals = (matchDetail.live?.keyEvents || []).filter((event: any) => event.type === 'goal');
            const goal = goals.at(-1);
            if (goal?.player) scorer = goal.player;
            if (goal?.minute != null) minute = `${goal.minute}${goal.addedTime ? `+${goal.addedTime}` : ''}′`;
          } catch { /* Keep the score alert if incident detail is briefly unavailable. */ }
          const alertId = `${fixtureId}-${score}`;
          setAlerts((current) => current.some((alert) => alert.id === alertId) ? current : [...current, {
            id: alertId,
            fixtureId,
            title: `⚽ ${fixture.home_team} ${fixture.home_score}–${fixture.away_score} ${fixture.away_team}`,
            detail: `${minute} · ${scorer} · picked by ${row.player_name}`,
          }]);
          window.setTimeout(() => setAlerts((current) => current.filter((alert) => alert.id !== alertId)), 15_000);
        }
        if (score >= 3) wonFixtures.current.add(fixtureId);
      }
      previousScores.current = nextScores;
      hasLoaded.current = true;
      setData((current: any) => {
        if (!current || (current.matches || []).length === 0) return body;
        const currentBySelection = new Map(
          (current.matches || []).map((row: any) => [row.id, row])
        );
        const matches = (body.matches || []).map((row: any) => {
          const existing: any = currentBySelection.get(row.id);
          if (!existing) return row;
          const hasAuthoritativeLiveScore = Boolean(row.live);
          const persistedStatus = String(row.fixture?.match_status || '').toUpperCase();
          const persistedLiveStatus = persistedStatus === 'FT'
            ? 'finished'
            : persistedStatus === 'HT'
              ? 'halftime'
              : null;
          return {
            ...existing,
            ...row,
            fixture: {
              ...existing.fixture,
              ...row.fixture,
              home_score: hasAuthoritativeLiveScore ? row.fixture.home_score : existing.fixture.home_score,
              away_score: hasAuthoritativeLiveScore ? row.fixture.away_score : existing.fixture.away_score,
            },
            live: hasAuthoritativeLiveScore
              ? mergeBsdLiveEvent(existing.live, row.live)
              : existing.live && persistedLiveStatus
                ? { ...existing.live, status: persistedLiveStatus }
                : existing.live,
          };
        });
        return {
          ...current,
          ...body,
          matches,
          goals: matches.reduce((sum: number, row: any) =>
            sum + Math.min(3, Number(row.fixture?.home_score || 0) + Number(row.fixture?.away_score || 0)), 0),
        };
      });
      setError('');
    } catch (cause: any) { setError(cause.message); }
    finally { setLoading(false); setRefreshing(false); requestInFlight.current = false; }
  }, []);

  useEffect(() => {
    load(true);
    const timer = window.setInterval(() => load(false), 5_000);
    const refreshWhenVisible = () => { if (document.visibilityState === 'visible') load(false); };
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [load]);

  const active = data.matches.filter((row: any) =>
    Number(row.fixture.home_score || 0) + Number(row.fixture.away_score || 0) < 3 && !isFinishedMatch(row)
  );
  const lost = data.matches.filter((row: any) =>
    Number(row.fixture.home_score || 0) + Number(row.fixture.away_score || 0) < 3 && isFinishedMatch(row)
  );
  const won = data.matches.filter((row: any) => Number(row.fixture.home_score || 0) + Number(row.fixture.away_score || 0) >= 3);
  const percentage = Math.min(100, (Number(data.goals || 0) / 24) * 100);

  return (
    <main className="mx-auto max-w-2xl space-y-5 px-0 py-5 pb-24">
      <div className="fixed right-3 top-3 z-[90] w-[min(24rem,calc(100vw-1.5rem))] space-y-2" aria-live="polite">
        {alerts.map((alert) => <div key={alert.id} className="relative rounded-xl border border-emerald-500/60 bg-slate-900 shadow-2xl transition hover:border-emerald-300 hover:bg-slate-800">
          <Link href={`/live/${alert.fixtureId}`} className="block p-3 pr-10">
            <div className="text-sm font-bold text-white">{alert.title}</div>
            <div className="mt-1 text-xs text-emerald-300">{alert.detail}</div>
            <div className="mt-2 text-[10px] uppercase tracking-wide text-slate-400">Click to open match →</div>
          </Link>
          <button
            type="button"
            onClick={() => setAlerts((current) => current.filter((currentAlert) => currentAlert.id !== alert.id))}
            className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-sm text-slate-400 transition hover:bg-slate-700 hover:text-white"
            aria-label={`Dismiss ${alert.title} notification`}
            title="Dismiss notification"
          >
            ×
          </button>
        </div>)}
      </div>
      <section className="card overflow-hidden">
        <div className="flex items-end justify-between gap-3">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white">Live picks</h1>
            <button
              type="button"
              onClick={() => load(true)}
              disabled={refreshing}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-600 bg-slate-700/60 text-base text-slate-300 transition hover:text-white disabled:opacity-50"
              aria-label="Refresh live matches now"
              title={data.refreshedAt ? `Last updated ${new Date(data.refreshedAt).toLocaleTimeString('en-GB')}` : 'Refresh live matches now'}
            >
              <span className={refreshing ? 'animate-spin' : ''}>↻</span>
            </button>
          </div>
          <div className="text-3xl font-black text-emerald-400">{data.goals || 0}<span className="text-lg text-slate-400">/24</span></div>
        </div>
        <div className="mt-3 h-2.5 rounded-full bg-slate-700 overflow-hidden"><div className="h-full bg-emerald-400 transition-all" style={{ width: `${percentage}%` }} /></div>
      </section>
      {error && <div className="rounded-xl border border-red-700 bg-red-950/40 p-3 text-sm text-red-200">{error}</div>}
      {loading ? <div className="text-center text-slate-400 py-12">Loading live matches…</div> : (
        <>
          <section className="space-y-1.5"><h2 className="pb-0.5 text-sm font-bold text-slate-200">In play / waiting ({active.length})</h2>{active.map((row: any) => <MatchCard key={row.id} row={row} />)}</section>
          {lost.length > 0 && <section className="space-y-1.5 pt-2 border-t border-red-900"><h2 className="pb-0.5 text-sm font-bold text-red-400">Lost ({lost.length})</h2>{lost.map((row: any) => <MatchCard key={row.id} row={row} />)}</section>}
          {won.length > 0 && <section className="space-y-1.5 pt-2 border-t border-emerald-900"><h2 className="pb-0.5 text-sm font-bold text-emerald-400">Won ({won.length})</h2>{won.map((row: any) => <MatchCard key={row.id} row={row} />)}</section>}
          {data.matches.length === 0 && <div className="card text-center text-slate-400 py-10">No picks have been selected for the active round.</div>}
        </>
      )}
    </main>
  );
}
