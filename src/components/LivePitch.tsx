'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

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
  const x = Number(rawX);
  const y = Number(rawY);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 100 || y < 0 || y > 100) return null;
  // BSD normalizes each team as attacking left-to-right. Rotate away-team
  // positions onto one shared pitch so possession changes remain continuous.
  const isAway = teamOf(item) === 'away';
  const pitchX = isAway ? 100 - x : x;
  const pitchY = isAway ? 100 - y : y;
  return { x: Math.max(2, Math.min(98, pitchX)), y: Math.max(3, Math.min(97, pitchY)), item };
}

function actionText(item: any) {
  if (!item) return 'Waiting for the next event';
  const minute = item.minute ?? item.min ?? item.time?.minute;
  const rawAction = item.commentary || item.description || item.text || item.action_type || item.action || item.situation || item.event || item.type || 'Live update';
  const action = rawAction === 'temp_goal' ? 'Goal — checking' : rawAction === 'temp_save' ? 'Save — checking' : rawAction;
  const player = item.player?.name || item.player_name || (typeof item.player === 'string' ? item.player : null);
  return `${minute != null ? `${minute}′ · ` : ''}${String(action).replaceAll('_', ' ')}${player ? ` · ${player}` : ''}`;
}

function eventKey(item: any) {
  const point = pointOf(item);
  return [item.type, item.evid, item.ts || item.uts, item.action_type || item.action || item.situation, point?.x, point?.y, item.commentary].join('-');
}

function unique(items: any[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = eventKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function correctionKey(item: any) {
  const point = pointOf(item);
  return item.evid != null ? `evid-${item.evid}` : [teamOf(item), item.minute, item.second, point?.x?.toFixed(1), point?.y?.toFixed(1)].join('-');
}

function reconcile(items: any[]) {
  const result: any[] = [];
  for (const item of unique(items)) {
    const type = String(item.action_type || item.action || '').toLowerCase();
    if (['deleted_event', 'end_delay', 'start_delay'].includes(type)) {
      if (type === 'deleted_event') {
        const key = correctionKey(item);
        for (let index = result.length - 1; index >= 0; index--) {
          if (correctionKey(result[index]) === key) result.splice(index, 1);
        }
      }
      continue;
    }
    if (!type.startsWith('temp_')) {
      const key = correctionKey(item);
      for (let index = result.length - 1; index >= 0; index--) {
        const previousType = String(result[index].action_type || result[index].action || '').toLowerCase();
        if (previousType.startsWith('temp_') && correctionKey(result[index]) === key) result.splice(index, 1);
      }
    }
    result.push(item);
  }
  return result;
}

export default function LivePitch({ detail, streamUrl, onMatchEvent }: { detail: any; streamUrl?: string; onMatchEvent?: (event: any) => void }) {
  const [streamItems, setStreamItems] = useState<any[]>([]);
  const [connected, setConnected] = useState(false);
  const [feedSource, setFeedSource] = useState<string | null>(null);
  const [feedError, setFeedError] = useState('');
  const eventCallback = useRef(onMatchEvent);
  eventCallback.current = onMatchEvent;

  useEffect(() => {
    if (!streamUrl) return;
    setStreamItems([]);
    setFeedSource(null);
    setFeedError('');
    const source = new EventSource(streamUrl);
    source.onopen = () => { setConnected(true); setFeedError(''); };
    source.onerror = () => setConnected(false);
    source.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'error') {
          setFeedError(message.message || message.code || 'Live feed unavailable');
          setConnected(false);
          source.close();
          return;
        }
        if (message.type === 'snapshot') {
          const livedata = Array.isArray(message.livedata) ? message.livedata : message.livedata ? [message.livedata] : [];
          setFeedSource(message.source || null);
          setStreamItems(reconcile([...(message.history || []), ...livedata]).slice(-300));
          if (message.event) eventCallback.current?.(message.event);
        } else if (message.type === 'event') {
          eventCallback.current?.(message);
        } else {
          setStreamItems((current) => reconcile([...current, message]).slice(-300));
        }
      } catch { /* Ignore malformed live frames and keep the last good position. */ }
    };
    return () => source.close();
  }, [streamUrl]);

  const detailActions = Array.isArray(detail?.actions) ? detail.actions : [];
  const sourceItems = useMemo(() => reconcile(streamItems.length > 0 ? streamItems : detailActions.length > 0 ? detailActions : (detail?.shotmap || [])), [streamItems, detailActions, detail?.shotmap]);
  const pitchItems = useMemo(() => sourceItems.filter((item: any) => pointOf(item)), [sourceItems]);
  const teamPitchItems = pitchItems.filter((item: any) => teamOf(item));
  const latestItem = teamPitchItems.at(-1);
  const latestPoint = pointOf(latestItem);
  const latestTeam = teamOf(latestItem);
  const sameTeamRaw: any[] = [];
  for (let index = teamPitchItems.length - 1; index >= 0; index--) {
    const item = teamPitchItems[index];
    const team = teamOf(item);
    if (latestTeam && team && team !== latestTeam) break;
    if (!latestTeam || team === latestTeam) sameTeamRaw.unshift(item);
  }
  const sameTeam = sameTeamRaw.filter((item: any, index: number) => {
    if (index === 0) return true;
    const point = pointOf(item);
    const previous = pointOf(sameTeamRaw[index - 1]);
    return point?.x !== previous?.x || point?.y !== previous?.y;
  });
  const passes = sameTeam.filter((item: any) => String(item.action_type || item.action || item.event || '').toLowerCase().includes('pass'));
  const trail = (passes.length >= 2 ? passes : sameTeam).slice(-3).map(pointOf).filter(Boolean) as PitchPoint[];
  const colour = latestTeam === 'away' ? '#f472b6' : '#fbbf24';

  return <section className="card overflow-hidden">
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-sm font-bold text-white">Live pitch</h2>
      <span className={`flex items-center gap-1.5 text-[10px] uppercase tracking-wider ${feedError ? 'text-red-300' : connected ? 'text-emerald-300' : 'text-slate-500'}`}><i className={`h-2 w-2 rounded-full ${feedError ? 'bg-red-400' : connected ? 'animate-pulse bg-emerald-400' : 'bg-slate-600'}`} />{feedError ? 'Feed error' : feedSource === 'full' ? 'WS+ live' : feedSource === 'basic' ? 'Basic live' : connected ? 'Live connection' : 'Connecting'}</span>
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
    </div>
    <div key={actionText(latestItem)} className="live-event-enter mt-3 rounded-lg border-l-4 bg-slate-950/80 px-3 py-2.5 shadow-lg" style={{ borderColor: colour }}>
      <div className="text-[9px] font-black uppercase tracking-[.18em]" style={{ color: colour }}>Current event{latestTeam ? ` · ${latestTeam}` : ''}</div>
      <div className="mt-0.5 text-sm font-black capitalize text-white">{actionText(latestItem)}</div>
    </div>
    {feedError && <div className="mt-2 text-xs text-red-300">{feedError}</div>}
  </section>;
}
