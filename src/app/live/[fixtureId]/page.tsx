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

function eventMinute(event: any) {
  if (event.minute == null) return '–';
  return `${event.minute}${event.addedTime ? `+${event.addedTime}` : ''}′`;
}

function actionTeam(item: any) {
  return item.team || item.side || (item.home === true ? 'home' : item.home === false ? 'away' : null);
}

function actionPoint(item: any) {
  const raw = item?.coordinates?.at?.(-1) || item?.pos || item;
  const rawX = raw?.x ?? raw?.coordinate_x;
  const rawY = raw?.y ?? raw?.coordinate_y;
  if (rawX == null || rawY == null) return null;
  return { x: Math.max(2, Math.min(98, Number(rawX))), y: Math.max(2, Math.min(98, 100 - Number(rawY))), item };
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
  const positionedActions = [...pitchActions, ...shotmap].filter((item: any) => actionPoint(item));
  const latestAction = positionedActions.at(-1);
  const latestTeam = actionTeam(latestAction);
  const sameTeam = latestTeam ? positionedActions.filter((item: any) => actionTeam(item) === latestTeam) : positionedActions;
  const passes = sameTeam.filter((item: any) => String(item.action_type || item.action || '').toLowerCase().includes('pass'));
  const trail = (passes.length >= 2 ? passes : sameTeam).slice(-3).map(actionPoint).filter(Boolean) as Array<{ x: number; y: number; item: any }>;
  const trailColour = latestTeam === 'away' ? '#f472b6' : '#fcd34d';
  return (
    <main className="max-w-2xl mx-auto px-4 py-5 pb-24 space-y-4">
      <Link href="/live" className="text-sm text-emerald-400">← All live picks</Link>
      {error && <div className="card text-red-300">{error}</div>}
      {!fixture ? <div className="text-center text-slate-400 py-16">Loading match centre…</div> : <>
        <section className="card text-center">
          <div className="text-xs text-slate-400">{fixture.league_name} · {live?.minute != null ? `${live.minute}'` : fixture.match_status}</div>
          {data?.pickedBy?.length > 0 && <div className="mt-1 text-xs font-semibold text-emerald-400">Picked by {data.pickedBy.join(', ')}</div>}
          <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-4"><div className="font-semibold text-white">{fixture.home_team}</div><div className="text-4xl font-black text-white">{live?.homeScore ?? fixture.home_score ?? 0}–{live?.awayScore ?? fixture.away_score ?? 0}</div><div className="font-semibold text-white">{fixture.away_team}</div></div>
          <div className="mt-4 flex justify-center gap-6 text-xs text-slate-300"><span>Shots on target {live?.homeShotsOnTarget ?? '–'}–{live?.awayShotsOnTarget ?? '–'}</span><span>{live?.xgEstimated ? 'xG est.' : 'xG'} {live?.homeXg?.toFixed?.(2) ?? '–'}–{live?.awayXg?.toFixed?.(2) ?? '–'}</span></div>
        </section>
        <section className="card"><h2 className="text-sm font-bold text-white mb-3">Live pitch</h2><div className="relative aspect-[1.55] rounded-xl overflow-hidden border-2 border-white/60 bg-emerald-700">
          <div className="absolute inset-y-0 left-1/2 border-l border-white/60"/><div className="absolute left-1/2 top-1/2 w-20 h-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/60"/><div className="absolute inset-y-[22%] left-0 w-[16%] border border-l-0 border-white/60"/><div className="absolute inset-y-[22%] right-0 w-[16%] border border-r-0 border-white/60"/>
          {trail.length > 0 && <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            {trail.slice(1).map((point, index) => <line key={`line-${index}`} x1={trail[index].x} y1={trail[index].y} x2={point.x} y2={point.y} stroke={trailColour} strokeWidth="0.9" strokeDasharray="2 1" opacity={0.35 + index * 0.3} />)}
            {trail.map((point, index) => <circle key={`point-${index}`} cx={point.x} cy={point.y} r={index === trail.length - 1 ? 2.1 : 1.5} fill={trailColour} stroke="white" strokeWidth="0.6" opacity={0.3 + (index + 1) * (0.7 / trail.length)} />)}
          </svg>}
          {!latestAction && <div className="absolute inset-0 grid place-items-center text-xs text-emerald-100">Pitch actions appear when the match is live</div>}
        </div></section>
        {live?.keyEvents?.length > 0 && <section className="card">
          <h2 className="mb-3 text-sm font-bold text-white">Key events</h2>
          <div className="space-y-2">{live.keyEvents.map((event: any) => <div key={event.id} className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-2 rounded-lg bg-slate-800/60 px-3 py-2 text-sm">
            <span className="font-bold text-emerald-400">{eventMinute(event)}</span>
            <span className="text-slate-200">{event.type === 'goal' ? '⚽' : event.type === 'red-card' ? '🟥' : event.type === 'yellow-card' ? '🟨' : event.type === 'substitution' ? '🔁' : 'VAR'} {event.player || 'Match update'}{event.assist ? <span className="text-xs text-slate-400"> · assist {event.assist}</span> : null}</span>
            {event.homeScore != null && event.awayScore != null && <span className="font-bold text-white">{event.homeScore}–{event.awayScore}</span>}
          </div>)}</div>
        </section>}
        <section className="card"><h2 className="text-sm font-bold text-white mb-3">Commentary</h2><div className="space-y-2 max-h-80 overflow-y-auto">{[...(live?.incidents || []), ...pitchActions].slice(-80).reverse().map((item: any, index: number) => <div key={item.id || index} className="border-l-2 border-emerald-500 pl-3 py-1 text-sm text-slate-200">{labelIncident(item)}</div>)}{!live?.incidents?.length && !pitchActions.length && <div className="text-sm text-slate-500">No match commentary yet.</div>}</div></section>
      </>}
    </main>
  );
}
