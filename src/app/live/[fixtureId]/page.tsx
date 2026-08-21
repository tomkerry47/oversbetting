'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import LiveKeyEvents from '@/components/LiveKeyEvents';
import LivePitch from '@/components/LivePitch';
import LiveStats from '@/components/LiveStats';
import LiveLineups from '@/components/LiveLineups';
import { mergeBsdLiveEvent } from '@/lib/bsd-live-client';

export default function MatchCentrePage() {
  const { fixtureId } = useParams<{ fixtureId: string }>();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [replayEvent, setReplayEvent] = useState<any>(null);
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
  useEffect(() => { load(); const timer = window.setInterval(load, 10_000); return () => clearInterval(timer); }, [load]);

  const fixture = data?.fixture;
  const live = data?.live;
  return (
    <main className="mx-auto max-w-7xl space-y-4 px-2 py-5 pb-24 sm:px-4 lg:px-6">
      <Link href="/live" className="text-sm text-emerald-400">← All live picks</Link>
      {error && <div className="card text-red-300">{error}</div>}
      {!fixture ? <div className="text-center text-slate-400 py-16">Loading match centre…</div> : <>
        <section className="card text-center">
          <div className="text-xs text-slate-400">{fixture.league_name} · {live?.minute != null ? `${live.minute}'` : fixture.match_status}</div>
          {data?.pickedBy?.length > 0 && <div className="mt-1 text-xs font-semibold text-emerald-400">Picked by {data.pickedBy.join(', ')}</div>}
          <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-4"><div className="font-semibold text-white">{fixture.home_team}</div><div className="text-4xl font-black text-white">{live?.homeScore ?? fixture.home_score ?? 0}–{live?.awayScore ?? fixture.away_score ?? 0}</div><div className="font-semibold text-white">{fixture.away_team}</div></div>
          <LiveKeyEvents events={live?.keyEvents} onReplay={Boolean(fixture.bsd_websocket_plus || live?.websocketPlus) ? setReplayEvent : undefined} />
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
          replayEvent={replayEvent}
        />
        <LiveStats stats={live} />
        <LiveLineups endpoint={`/api/live/${fixtureId}/lineups`} events={live?.keyEvents || []} />
      </>}
    </main>
  );
}
