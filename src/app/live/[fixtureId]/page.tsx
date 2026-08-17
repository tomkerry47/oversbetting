'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

function labelIncident(item: any) {
  const minute = item.minute ?? item.time ?? item.match_minute;
  const type = item.incident_type || item.type || item.action || 'Update';
  const player = item.player_name || item.player?.name || item.player || '';
  const team = item.team_name || item.team?.name || '';
  const text = item.commentary || item.description || item.text;
  return `${minute != null ? `${minute}' ` : ''}${text || [String(type).replaceAll('_', ' '), player, team].filter(Boolean).join(' · ')}`;
}

export default function MatchCentrePage() {
  const { fixtureId } = useParams<{ fixtureId: string }>();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/live/${fixtureId}`, { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Match refresh failed');
      setData(body); setError('');
    } catch (cause: any) { setError(cause.message); }
  }, [fixtureId]);
  useEffect(() => { load(); const timer = window.setInterval(load, 10_000); return () => clearInterval(timer); }, [load]);

  const fixture = data?.fixture;
  const live = data?.live;
  const pitchActions = Array.isArray(live?.actions) ? live.actions : [];
  const shotmap = Array.isArray(live?.shotmap) ? live.shotmap : [];
  const latestAction = [...pitchActions, ...shotmap].filter((item: any) => item?.x != null || item?.coordinate_x != null).at(-1);
  const x = Math.max(2, Math.min(98, Number(latestAction?.x ?? latestAction?.coordinate_x ?? 50)));
  const y = Math.max(2, Math.min(98, Number(latestAction?.y ?? latestAction?.coordinate_y ?? 50)));
  return (
    <main className="max-w-2xl mx-auto px-4 py-5 pb-24 space-y-4">
      <Link href="/live" className="text-sm text-emerald-400">← All live picks</Link>
      {error && <div className="card text-red-300">{error}</div>}
      {!fixture ? <div className="text-center text-slate-400 py-16">Loading match centre…</div> : <>
        <section className="card text-center">
          <div className="text-xs text-slate-400">{fixture.league_name} · {live?.minute != null ? `${live.minute}'` : fixture.match_status}</div>
          <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-4"><div className="font-semibold text-white">{fixture.home_team}</div><div className="text-4xl font-black text-white">{live?.homeScore ?? fixture.home_score ?? 0}–{live?.awayScore ?? fixture.away_score ?? 0}</div><div className="font-semibold text-white">{fixture.away_team}</div></div>
          <div className="mt-4 flex justify-center gap-6 text-xs text-slate-300"><span>Shots on target {live?.homeShotsOnTarget ?? '–'}–{live?.awayShotsOnTarget ?? '–'}</span><span>xG {live?.homeXg?.toFixed?.(2) ?? '–'}–{live?.awayXg?.toFixed?.(2) ?? '–'}</span></div>
        </section>
        <section className="card"><h2 className="text-sm font-bold text-white mb-3">Live pitch</h2><div className="relative aspect-[1.55] rounded-xl overflow-hidden border-2 border-white/60 bg-emerald-700">
          <div className="absolute inset-y-0 left-1/2 border-l border-white/60"/><div className="absolute left-1/2 top-1/2 w-20 h-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/60"/><div className="absolute inset-y-[22%] left-0 w-[16%] border border-l-0 border-white/60"/><div className="absolute inset-y-[22%] right-0 w-[16%] border border-r-0 border-white/60"/>
          {latestAction && <div className="absolute w-4 h-4 -ml-2 -mt-2 rounded-full bg-amber-300 border-2 border-white shadow-lg animate-pulse" style={{ left: `${x}%`, top: `${100-y}%` }} title={latestAction.action || latestAction.action_type || 'Latest action'} />}
          {!latestAction && <div className="absolute inset-0 grid place-items-center text-xs text-emerald-100">Pitch actions appear when the match is live</div>}
        </div></section>
        <section className="card"><h2 className="text-sm font-bold text-white mb-3">Commentary</h2><div className="space-y-2 max-h-80 overflow-y-auto">{[...(live?.incidents || []), ...pitchActions].slice(-80).reverse().map((item: any, index: number) => <div key={item.id || index} className="border-l-2 border-emerald-500 pl-3 py-1 text-sm text-slate-200">{labelIncident(item)}</div>)}{!live?.incidents?.length && !pitchActions.length && <div className="text-sm text-slate-500">No match commentary yet.</div>}</div></section>
      </>}
    </main>
  );
}
