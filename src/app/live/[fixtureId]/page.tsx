'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import LiveKeyEvents from '@/components/LiveKeyEvents';
import LivePitch from '@/components/LivePitch';
import LiveStats from '@/components/LiveStats';
import LiveLineups from '@/components/LiveLineups';
import LiveMatchClock from '@/components/LiveMatchClock';
import { mergeBsdLiveEvent } from '@/lib/bsd-live-client';

export default function MatchCentrePage() {
  const { fixtureId } = useParams<{ fixtureId: string }>();
  const [data, setData] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [error, setError] = useState('');
  const scoreRequestInFlight = useRef(false);
  const statsRequestInFlight = useRef(false);
  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/live/${fixtureId}`, { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Match refresh failed');
      setData(body); setError('');
    } catch (cause: any) { setError(cause.message); }
  }, [fixtureId]);
  const handleMatchEvent = useCallback((event: any) => {
    setData((current: any) => current ? { ...current, live: mergeBsdLiveEvent(current.live, event) } : current);
  }, []);
  const loadScore = useCallback(async () => {
    if (scoreRequestInFlight.current) return;
    scoreRequestInFlight.current = true;
    try {
      const response = await fetch(`/api/live/${fixtureId}/score`, { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Score refresh failed');
      if (body.live) handleMatchEvent(body.live);
    } catch { /* The continuous live stream remains the primary score source. */ }
    finally { scoreRequestInFlight.current = false; }
  }, [fixtureId, handleMatchEvent]);
  const loadStats = useCallback(async () => {
    if (statsRequestInFlight.current) return;
    statsRequestInFlight.current = true;
    try {
      const response = await fetch(`/api/live/${fixtureId}/stats`, { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Stats refresh failed');
      if (body.stats) setStats(body.stats);
    } catch { /* Keep the last good stats snapshot. */ }
    finally { statsRequestInFlight.current = false; }
  }, [fixtureId]);
  useEffect(() => {
    load();
    loadStats();
    const scoreTimer = window.setInterval(loadScore, 5_000);
    const statsTimer = window.setInterval(loadStats, 60_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        loadScore();
        loadStats();
      }
    };
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearInterval(scoreTimer);
      window.clearInterval(statsTimer);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [load, loadScore, loadStats]);

  const fixture = data?.fixture;
  const live = data?.live;
  return (
    <main className="-mx-[0.5rem] w-[calc(100%+1rem)] max-w-none space-y-4 px-[0.1rem] py-5 pb-24">
      <Link href="/live" className="text-sm text-emerald-400">← All live picks</Link>
      {error && <div className="card text-red-300">{error}</div>}
      {!fixture ? <div className="text-center text-slate-400 py-16">Loading match centre…</div> : <>
        <section className="card text-center">
          <div className="flex items-center justify-center gap-1.5 text-xs text-slate-400">
            <span>{fixture.league_name}</span>
            <span aria-hidden="true">·</span>
            <LiveMatchClock live={live} fallbackStatus={fixture.match_status} kickOff={fixture.kick_off} className="font-bold text-emerald-400" />
          </div>
          {data?.pickedBy?.length > 0 && <div className="mt-1 text-xs font-semibold text-emerald-400">Picked by {data.pickedBy.join(', ')}</div>}
          <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-4"><div className="font-semibold text-white">{fixture.home_team}</div><div className="text-4xl font-black text-white">{live?.homeScore ?? fixture.home_score ?? 0}–{live?.awayScore ?? fixture.away_score ?? 0}</div><div className="font-semibold text-white">{fixture.away_team}</div></div>
          <LiveKeyEvents events={live?.keyEvents} />
        </section>
        <LivePitch
          detail={live}
          streamUrl={`/api/live/${fixtureId}/stream`}
          onMatchEvent={handleMatchEvent}
          eventId={fixture.bsd_event_id}
          websocketPlus={Boolean(fixture.bsd_websocket_plus || live?.websocketPlus)}
          matchStatus={live?.status || fixture.match_status}
          homeTeam={fixture.home_team}
          awayTeam={fixture.away_team}
        />
        <LiveStats stats={{ ...(live || {}), ...(stats || {}) }} />
        <LiveLineups endpoint={`/api/live/${fixtureId}/lineups`} events={live?.keyEvents || []} />
      </>}
    </main>
  );
}
