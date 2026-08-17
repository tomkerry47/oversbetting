'use client';

import { useMemo } from 'react';

type PitchPoint = { x: number; y: number; item: any };

function teamOf(item: any): string | null {
  if (!item) return null;
  return item.team || item.side || (item.home === true || item.is_home === true ? 'home' : item.home === false || item.is_home === false ? 'away' : null);
}

function pointOf(item: any): PitchPoint | null {
  const raw = item?.coordinates?.at?.(-1) || item?.pos || item;
  const rawX = raw?.x ?? raw?.coordinate_x;
  const rawY = raw?.y ?? raw?.coordinate_y;
  if (rawX == null || rawY == null) return null;
  return { x: Math.max(2, Math.min(98, Number(rawX))), y: Math.max(3, Math.min(97, 100 - Number(rawY))), item };
}

function actionText(item: any) {
  if (!item) return 'Waiting for the next event';
  const minute = item.minute ?? item.min ?? item.time?.minute;
  const action = item.commentary || item.description || item.text || item.action_type || item.action || item.situation || item.event || item.type || 'Live update';
  const player = item.player?.name || item.player_name || (typeof item.player === 'string' ? item.player : null);
  return `${minute != null ? `${minute}′ · ` : ''}${String(action).replaceAll('_', ' ')}${player ? ` · ${player}` : ''}`;
}

export default function LivePitch({ detail }: { detail: any }) {
  const pitchItems = useMemo(() =>
    [...(detail?.actions || []), ...(detail?.shotmap || [])].filter((item: any) => pointOf(item)), [detail]);
  const latestItem = pitchItems.at(-1);
  const latestPoint = pointOf(latestItem);
  const latestTeam = teamOf(latestItem);
  const sameTeam = latestTeam ? pitchItems.filter((item: any) => teamOf(item) === latestTeam) : pitchItems;
  const passes = sameTeam.filter((item: any) => String(item.action_type || item.action || item.event || '').toLowerCase().includes('pass'));
  const trail = (passes.length >= 2 ? passes : sameTeam).slice(-3).map(pointOf).filter(Boolean) as PitchPoint[];
  const colour = latestTeam === 'away' ? '#f472b6' : '#fbbf24';

  return <section className="card overflow-hidden">
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-sm font-bold text-white">Live pitch</h2>
      {latestTeam && <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-400"><i className="h-2 w-2 rounded-full" style={{ backgroundColor: colour }} />{latestTeam} possession</span>}
    </div>
    <div className="live-pitch relative aspect-[1.55] overflow-hidden rounded-xl border border-emerald-300/50 shadow-inner">
      <div className="absolute inset-[2.5%] border border-white/75" />
      <div className="absolute inset-y-[2.5%] left-1/2 border-l border-white/75" />
      <div className="absolute left-1/2 top-1/2 h-[25%] aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/75" />
      <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80" />
      <div className="absolute inset-y-[21%] left-[2.5%] w-[16%] border border-l-0 border-white/75" />
      <div className="absolute inset-y-[21%] right-[2.5%] w-[16%] border border-r-0 border-white/75" />
      <div className="absolute inset-y-[35%] left-[2.5%] w-[6%] border border-l-0 border-white/75" />
      <div className="absolute inset-y-[35%] right-[2.5%] w-[6%] border border-r-0 border-white/75" />
      <div className="absolute left-[12.5%] top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-white/80" />
      <div className="absolute right-[12.5%] top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-white/80" />
      <div className="absolute inset-y-[42%] left-0 w-[2.5%] border-y border-l border-white/70 bg-white/10" />
      <div className="absolute inset-y-[42%] right-0 w-[2.5%] border-y border-r border-white/70 bg-white/10" />
      {trail.length > 0 && <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {trail.slice(1).map((point, index) => <line className="live-trail" key={`line-${index}`} x1={trail[index].x} y1={trail[index].y} x2={point.x} y2={point.y} stroke={colour} strokeWidth="1.15" strokeLinecap="round" opacity={0.3 + index * 0.32} />)}
        {trail.slice(0, -1).map((point, index) => <circle key={`point-${index}`} cx={point.x} cy={point.y} r="1.5" fill={colour} opacity={0.28 + index * 0.25} />)}
      </svg>}
      {latestPoint && <div className="live-ball absolute z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_12px_rgba(255,255,255,.9)]" style={{ left: `${latestPoint.x}%`, top: `${latestPoint.y}%`, backgroundColor: colour }} />}
      {!latestPoint && <div className="absolute inset-0 grid place-items-center bg-emerald-950/20 text-xs font-semibold text-emerald-50">Waiting for positioned actions…</div>}
      {latestItem && <div className="pointer-events-none absolute inset-x-[18%] top-1/2 z-20 -translate-y-1/2">
        <div key={actionText(latestItem)} className="live-event-enter rounded-md bg-emerald-950/80 px-3 py-2 text-center shadow-xl backdrop-blur-sm">
          <div className="text-[9px] font-black uppercase tracking-[.18em]" style={{ color: colour }}>Current event</div>
          <div className="mt-0.5 text-xs font-black uppercase leading-tight text-white sm:text-sm">{actionText(latestItem)}</div>
        </div>
      </div>}
    </div>
  </section>;
}
