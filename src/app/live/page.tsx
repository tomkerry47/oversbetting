'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

type LiveAlert = { id: string; fixtureId: string; title: string; detail: string };

function MatchCard({ row }: { row: any }) {
  const fixture = row.fixture;
  const goals = Number(fixture.home_score || 0) + Number(fixture.away_score || 0);
  const isBsd = fixture.data_provider === 'bsd';
  return (
    <Link href={isBsd ? `/live/${fixture.id}` : '#'} className={`block card ${isBsd ? 'active:scale-[.99]' : ''}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wide text-slate-400">
            {fixture.league_name} · {row.player_name} {isBsd ? '· BSD live' : '· 10 min updates'}
          </div>
          <div className="mt-1 text-sm font-semibold text-white truncate">
            {fixture.home_team} <span className="text-slate-500">v</span> {fixture.away_team}
          </div>
          {isBsd && (
            <div className="mt-2 flex gap-3 text-[11px] text-slate-300">
              <span>Shots on target {row.live?.homeShotsOnTarget ?? '–'}–{row.live?.awayShotsOnTarget ?? '–'}</span>
              <span>xG {row.live?.homeXg?.toFixed?.(2) ?? '–'}–{row.live?.awayXg?.toFixed?.(2) ?? '–'}</span>
            </div>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-black text-white">{fixture.home_score ?? 0}–{fixture.away_score ?? 0}</div>
          <div className={goals >= 3 ? 'text-emerald-400 text-xs font-bold' : 'text-amber-300 text-xs'}>
            {goals >= 3 ? 'WON ✓' : `${Math.min(goals, 3)}/3 goals`}
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function LivePage() {
  const [data, setData] = useState<any>({ matches: [], goals: 0, target: 24 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [alerts, setAlerts] = useState<LiveAlert[]>([]);
  const previousScores = useRef<Record<string, number>>({});
  const hasLoaded = useRef(false);
  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/live', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Live refresh failed');
      const nextScores: Record<string, number> = {};
      for (const row of body.matches || []) {
        const fixture = row.fixture;
        const fixtureId = String(fixture.id);
        const score = Number(fixture.home_score || 0) + Number(fixture.away_score || 0);
        nextScores[fixtureId] = score;
        const previous = previousScores.current[fixtureId];
        if (hasLoaded.current && fixture.data_provider === 'bsd' && previous != null && score > previous) {
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
      }
      previousScores.current = nextScores;
      hasLoaded.current = true;
      setData(body); setError('');
    } catch (cause: any) { setError(cause.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const active = data.matches.filter((row: any) => Number(row.fixture.home_score || 0) + Number(row.fixture.away_score || 0) < 3);
  const won = data.matches.filter((row: any) => Number(row.fixture.home_score || 0) + Number(row.fixture.away_score || 0) >= 3);
  const percentage = Math.min(100, (Number(data.goals || 0) / 24) * 100);

  return (
    <main className="max-w-2xl mx-auto px-4 py-5 pb-24 space-y-5">
      <div className="fixed right-3 top-3 z-[90] w-[min(24rem,calc(100vw-1.5rem))] space-y-2" aria-live="polite">
        {alerts.map((alert) => <Link key={alert.id} href={`/live/${alert.fixtureId}`} className="block rounded-xl border border-emerald-500/60 bg-slate-900 p-3 shadow-2xl transition hover:border-emerald-300 hover:bg-slate-800">
          <div className="text-sm font-bold text-white">{alert.title}</div>
          <div className="mt-1 text-xs text-emerald-300">{alert.detail}</div>
          <div className="mt-2 text-[10px] uppercase tracking-wide text-slate-400">Click to open match →</div>
        </Link>)}
      </div>
      <section className="card overflow-hidden">
        <div className="flex items-end justify-between">
          <div><div className="text-xs uppercase tracking-widest text-slate-400">Goal score</div><h1 className="text-xl font-bold text-white">Live picks</h1></div>
          <div className="text-3xl font-black text-emerald-400">{data.goals || 0}<span className="text-lg text-slate-400">/24</span></div>
        </div>
        <div className="mt-3 h-2.5 rounded-full bg-slate-700 overflow-hidden"><div className="h-full bg-emerald-400 transition-all" style={{ width: `${percentage}%` }} /></div>
        <div className="mt-2 text-[10px] text-slate-500">Each pick contributes a maximum of three goals.</div>
      </section>
      {error && <div className="rounded-xl border border-red-700 bg-red-950/40 p-3 text-sm text-red-200">{error}</div>}
      {loading ? <div className="text-center text-slate-400 py-12">Loading live matches…</div> : (
        <>
          <section className="space-y-3"><h2 className="text-sm font-bold text-slate-200">In play / waiting ({active.length})</h2>{active.map((row: any) => <MatchCard key={row.id} row={row} />)}</section>
          {won.length > 0 && <section className="space-y-3 pt-3 border-t border-emerald-900"><h2 className="text-sm font-bold text-emerald-400">Won ({won.length})</h2>{won.map((row: any) => <MatchCard key={row.id} row={row} />)}</section>}
          {data.matches.length === 0 && <div className="card text-center text-slate-400 py-10">No picks have been selected for the active round.</div>}
        </>
      )}
    </main>
  );
}
