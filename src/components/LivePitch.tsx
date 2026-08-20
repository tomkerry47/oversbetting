'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type PitchPoint = { x: number; y: number; item: any };
type LivePitchProps = {
  detail: any;
  streamUrl?: string;
  onMatchEvent?: (event: any) => void;
  eventId?: number | string | null;
  websocketPlus?: boolean;
  matchStatus?: string | null;
  homeTeam?: string;
  awayTeam?: string;
  replayEvent?: any;
};

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
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < -5 || x > 105 || y < -5 || y > 105) return null;
  // Arena's live bridge normalizes both teams to attack left-to-right before
  // rendering. Apply the same 180-degree rotation to raw away-team WS+ frames.
  const isAway = teamOf(item) === 'away';
  const pitchX = isAway ? 100 - x : x;
  const pitchY = isAway ? 100 - y : y;
  return { x: Math.max(1, Math.min(99, pitchX)), y: Math.max(2, Math.min(98, pitchY)), item };
}

function actionOf(item: any) {
  return String(item?.action_type || item?.action || item?.event || item?.situation || item?.type || 'live_update').toLowerCase();
}

function playerOf(item: any) {
  return item?.player?.name || item?.player_name || (typeof item?.player === 'string' ? item.player : null) || item?.p || null;
}

function normalizedPlayer(value: unknown) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

const COMMENTARY: Record<string, string[]> = {
  pass: ['{p} sends possession onward for {team}', '{p} moves play across the pitch', '{p} finds another {team} shirt', '{team} work the ball through {p}'],
  ball_touch: ['{p} settles the ball', '{p} brings it under control'],
  ball_recovery: ['{p} retrieves possession for {team}', '{team} have the ball again through {p}'],
  interception: ['{p} anticipates the pass and steps in', '{p} breaks up the move'],
  tackle: ['{p} challenges cleanly and takes the ball', '{p} wins a firm challenge'],
  challenge: ['{p} competes for possession', '{p} presses into the duel'],
  take_on: ['{p} advances at the back line', '{p} tries to get beyond the defender'],
  aerial: ['{p} gets to the aerial ball first', '{p} wins the header'],
  clearance: ['{p} sends the ball away from danger', '{team} escape the pressure through {p}'],
  blocked_pass: ["{p}'s attempted pass is stopped", 'No route through for {p}'],
  dispossessed: ['{p} is pressured off the ball', '{team} surrender possession under pressure on {p}'],
  corner_awarded: ['{team} are awarded a corner', 'A corner follows for {team}'],
  keeper_pickup: ['The goalkeeper collects without trouble', 'The goalkeeper secures possession'],
  claim: ['The goalkeeper takes command of the ball'],
  punch: ['The goalkeeper punches the delivery away'],
  save: ['The goalkeeper makes the stop'],
  foul: ['The referee penalises {p}', '{p} gives away a free kick'],
  miss: ["{p}'s shot misses the target", '{p} strikes it beyond the goal'],
  attempt_saved: ["{p}'s effort is stopped", 'The goalkeeper denies {p}'],
  temp_save: ["A check follows {p}'s effort"],
  post: ["{p}'s shot rebounds off the woodwork"],
  goal: ['Goal for {team}, scored by {p}!', '{p} converts the chance for {team}!'],
  temp_goal: ['A possible {team} goal is being reviewed'],
  out: ['Play pauses with the ball beyond the line', 'A throw-in will restart play'],
  offside_pass: ['The flag goes up against {p}'],
  player_on: ['{p} enters the match'],
  player_off: ["{p}'s match is over"],
};

const TURNOVERS: Record<string, string> = {
  ball_recovery: 'Possession recovered', interception: 'Pass intercepted', tackle: 'Tackle won',
  dispossessed: 'Possession won', blocked_pass: 'Pass blocked', clearance: 'Danger cleared',
  aerial: 'Aerial won', challenge: 'Duel won', save: 'Goalkeeper possession', keeper_pickup: 'Goalkeeper possession',
};

function actionText(item: any, homeTeam = 'Home', awayTeam = 'Away') {
  if (!item) return 'Waiting for the next event';
  const minute = item.minute ?? item.min ?? item.time?.minute;
  const player = playerOf(item) || 'A player';
  const rawAction = actionOf(item);
  const supplied = [item.commentary, item.description, item.text].find((value) =>
    typeof value === 'string' && value.trim().split(/\s+/).length >= 4
  );
  const team = teamOf(item) === 'away' ? awayTeam : homeTeam;
  const options = COMMENTARY[rawAction];
  const seed = Number(item.second || item.sec || minute || 0) + player.length;
  const generated = options?.[seed % options.length] || `${player} · ${rawAction.replaceAll('_', ' ')}`;
  const summary = supplied || generated.replaceAll('{p}', player).replaceAll('{team}', team);
  return `${minute != null ? `${minute}′ · ` : ''}${summary}`;
}

function isDetailedAction(item: any) {
  const type = String(item.action_type || item.action || '').toLowerCase();
  return ['action', 'poem'].includes(item.type) && Boolean(teamOf(item)) && !type.startsWith('unknown_') && type !== 'injury_time_announcement';
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

export default function LivePitch({ detail, streamUrl, onMatchEvent, eventId, websocketPlus = false, matchStatus, homeTeam = 'Home', awayTeam = 'Away', replayEvent }: LivePitchProps) {
  const [streamItems, setStreamItems] = useState<any[]>([]);
  const [connected, setConnected] = useState(false);
  const [feedSource, setFeedSource] = useState<string | null>(null);
  const [feedError, setFeedError] = useState('');
  const arenaKey = process.env.NEXT_PUBLIC_ARENA_EMBED_KEY;
  const arenaAvailable = Boolean(arenaKey && eventId && websocketPlus);
  const [pitchMode, setPitchMode] = useState<'arena' | 'pitch'>(arenaAvailable ? 'arena' : 'pitch');
  const [replayFrames, setReplayFrames] = useState<any[] | null>(null);
  const [replayIndex, setReplayIndex] = useState(0);
  const [replayError, setReplayError] = useState('');
  const replayStarted = useRef<number | null>(null);
  const eventCallback = useRef(onMatchEvent);
  eventCallback.current = onMatchEvent;

  useEffect(() => { setPitchMode(arenaAvailable ? 'arena' : 'pitch'); }, [arenaAvailable, eventId]);

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
          setStreamItems(reconcile([...(message.history || []), ...livedata]).slice(-1500));
          if (message.event) eventCallback.current?.(message.event);
        } else if (message.type === 'event') {
          eventCallback.current?.(message);
        } else {
          setStreamItems((current) => reconcile([...current, message]).slice(-1500));
        }
      } catch { /* Ignore malformed live frames and keep the last good position. */ }
    };
    return () => source.close();
  }, [streamUrl]);

  const detailActions = Array.isArray(detail?.actions) ? detail.actions : [];
  const sourceItems = useMemo(() => {
    const reconciled = reconcile(streamItems.length > 0 ? streamItems : detailActions.length > 0 ? detailActions : (detail?.shotmap || []));
    const detailed = reconciled.filter(isDetailedAction);
    const basic = reconciled.filter((item: any) => item.type === 'livedata');
    if (feedSource === 'basic') return basic.length > 0 ? basic : reconciled;
    return detailed.length > 0 ? detailed : basic.length > 0 ? basic : reconciled;
  }, [streamItems, detailActions, detail?.shotmap, feedSource]);
  useEffect(() => {
    const requestId = Number(replayEvent?.replayNonce || 0);
    if (!requestId || replayStarted.current === requestId || sourceItems.length === 0) return;
    replayStarted.current = requestId;
    const positioned = sourceItems.filter((item: any) => pointOf(item));
    const wantedPlayer = normalizedPlayer(replayEvent?.player);
    const wantedMinute = Number(replayEvent?.minute);
    let goalIndex = -1;
    for (let index = positioned.length - 1; index >= 0; index--) {
      const item = positioned[index];
      const action = actionOf(item);
      const minute = Number(item.minute ?? item.min ?? item.time?.minute);
      const playerMatches = !wantedPlayer || normalizedPlayer(playerOf(item)) === wantedPlayer;
      if (['goal', 'temp_goal'].includes(action) && minute === wantedMinute && playerMatches) { goalIndex = index; break; }
    }
    // Incident attribution can be corrected after the raw WS+ frame (notably
    // own goals), so the minute is the reliable fallback when names differ.
    if (goalIndex < 0) {
      for (let index = positioned.length - 1; index >= 0; index--) {
        const item = positioned[index];
        const minute = Number(item.minute ?? item.min ?? item.time?.minute);
        if (['goal', 'temp_goal'].includes(actionOf(item)) && minute === wantedMinute) { goalIndex = index; break; }
      }
    }
    if (goalIndex < 0) {
      setReplayFrames(null);
      setReplayError('That goal is outside the available WS+ replay history.');
      return;
    }
    setReplayError('');
    setPitchMode('pitch');
    setReplayFrames(positioned.slice(Math.max(0, goalIndex - 12), goalIndex + 1));
    setReplayIndex(0);
  }, [replayEvent?.replayNonce, replayEvent?.minute, replayEvent?.player, sourceItems]);

  useEffect(() => {
    if (!replayFrames || replayFrames.length < 2) return;
    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      setReplayIndex(Math.min(index, replayFrames.length - 1));
      if (index >= replayFrames.length - 1) window.clearInterval(timer);
    }, 600);
    return () => window.clearInterval(timer);
  }, [replayFrames]);

  const displayedItems = replayFrames ? replayFrames.slice(0, replayIndex + 1) : sourceItems;
  const pitchItems = useMemo(() => displayedItems.filter((item: any) => pointOf(item)), [displayedItems]);
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
  const previousTeam = teamOf(teamPitchItems.at(-2));
  const rawAction = actionOf(latestItem);
  const possessionChanged = Boolean(latestTeam && previousTeam && latestTeam !== previousTeam);
  const possessionLabel = TURNOVERS[rawAction] || (possessionChanged ? 'Possession changed' : 'In possession');
  const teamLabel = latestTeam === 'away' ? awayTeam : homeTeam;
  const activePlayer = playerOf(latestItem);
  const isShot = ['goal', 'temp_goal', 'attempt_saved', 'temp_save', 'save', 'miss', 'post'].includes(rawAction);
  const goalMouthY = Number(latestItem?.gmy ?? latestItem?.goal_mouth_y ?? latestItem?.goalMouthY ?? 50);
  const shotTarget = latestPoint && isShot ? {
    x: latestTeam === 'away' ? 1 : 99,
    y: Math.max(38, Math.min(62, Number.isFinite(goalMouthY) ? goalMouthY : 50)),
  } : null;
  const arenaStatus = String(matchStatus || detail?.status || '').toLowerCase().replaceAll('_', '');
  const arenaMode = ['inprogress', 'live', '1sthalf', '2ndhalf', 'halftime', 'paused', 'extratime'].includes(arenaStatus) ? 'live' : 'replay';
  const arenaUrl = arenaAvailable ? `https://arena.bzzoiro.com/embed/${arenaMode}/${eventId}/?key=${encodeURIComponent(arenaKey!)}` : '';

  if (arenaAvailable && pitchMode === 'arena') return <section className="overflow-hidden rounded-xl border border-slate-700 bg-slate-800/80 p-2 shadow-lg sm:p-4">
    <div className="mb-3 flex items-center justify-between gap-2">
      <div><h2 className="text-sm font-bold text-white">Arena3D</h2><div className="text-[9px] uppercase tracking-wider text-emerald-400">WS+ {arenaMode}</div></div>
      <div className="flex rounded-lg border border-slate-700 bg-slate-900 p-0.5 text-[10px] font-semibold">
        <button className="rounded-md bg-emerald-500 px-2.5 py-1 text-slate-950" aria-pressed="true">3D</button>
        <button onClick={() => { setReplayFrames(null); setReplayError(''); setPitchMode('pitch'); }} className="rounded-md px-2.5 py-1 text-slate-400 hover:text-white" aria-pressed="false">2D</button>
      </div>
    </div>
    <div className="relative aspect-[3/4] overflow-hidden rounded-xl border border-slate-700 bg-slate-950 sm:aspect-square md:aspect-[4/3] xl:aspect-[16/10]">
      <iframe src={arenaUrl} title={`Arena3D ${homeTeam} vs ${awayTeam}`} className="absolute inset-0 h-full w-full border-0" allow="fullscreen" allowFullScreen loading="eager" referrerPolicy="strict-origin-when-cross-origin" />
    </div>
  </section>;

  return <section className="overflow-hidden rounded-xl border border-slate-700 bg-slate-800/80 p-2 shadow-lg sm:p-4">
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-sm font-bold text-white">Live pitch</h2>
      <div className="flex items-center gap-2">
        {replayFrames && <button onClick={() => { setReplayFrames(null); setReplayError(''); }} className="rounded-md border border-amber-500/50 bg-amber-500/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-amber-300">Return live</button>}
        {arenaAvailable && <button onClick={() => { setReplayFrames(null); setReplayError(''); setPitchMode('arena'); }} className="rounded-md border border-emerald-600/50 bg-emerald-500/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-emerald-300">View 3D</button>}
        <span className={`flex items-center gap-1.5 text-[10px] uppercase tracking-wider ${feedError ? 'text-red-300' : connected ? 'text-emerald-300' : 'text-slate-500'}`}><i className={`h-2 w-2 rounded-full ${feedError ? 'bg-red-400' : connected ? 'animate-pulse bg-emerald-400' : 'bg-slate-600'}`} />{feedError ? 'Feed error' : feedSource === 'full' ? 'WS+ live' : feedSource === 'basic' ? 'Basic live' : connected ? 'Live connection' : 'Connecting'}</span>
      </div>
    </div>
    <div className="live-pitch relative aspect-[1.55] overflow-hidden rounded-xl border border-emerald-300/50 shadow-inner">
      {latestTeam && <div className="absolute left-3 top-3 z-20 flex items-center gap-2 rounded-full border border-white/15 bg-slate-950/80 px-2.5 py-1.5 shadow-lg backdrop-blur">
        <i className="h-2 w-2 rounded-full" style={{ backgroundColor: colour, boxShadow: `0 0 8px ${colour}` }} />
        <span className="text-[9px] font-black uppercase tracking-wider text-white">{replayFrames ? 'Goal replay' : teamLabel}</span>
        <span className={`text-[9px] font-semibold ${possessionChanged || TURNOVERS[rawAction] ? 'text-amber-300' : 'text-slate-400'}`}>{possessionLabel}</span>
      </div>}
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
      {(trail.length > 0 || shotTarget) && <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs><filter id="trail-glow"><feGaussianBlur stdDeviation="0.8" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
        {trail.slice(1).map((point, index) => <line className="live-trail" key={`line-${index}`} x1={trail[index].x} y1={trail[index].y} x2={point.x} y2={point.y} stroke={colour} strokeWidth={0.75 + index * 0.22} strokeLinecap="round" opacity={0.25 + index * 0.35} filter="url(#trail-glow)" />)}
        {trail.slice(0, -1).map((point, index) => <circle key={`point-${index}`} cx={point.x} cy={point.y} r={1.1 + index * 0.25} fill={colour} opacity={0.22 + index * 0.28} />)}
        {shotTarget && latestPoint && <path className="live-shot-arc" d={`M ${latestPoint.x} ${latestPoint.y} Q ${(latestPoint.x + shotTarget.x) / 2} ${Math.max(4, Math.min(latestPoint.y, shotTarget.y) - 12)} ${shotTarget.x} ${shotTarget.y}`} fill="none" stroke="#fff" strokeWidth="1" strokeDasharray="2 1.4" opacity="0.85" filter="url(#trail-glow)" />}
      </svg>}
      {latestPoint && <>
        {activePlayer && <div className="live-player-tag absolute z-20 flex max-w-[46%] -translate-x-1/2 -translate-y-[145%] items-center gap-1.5 rounded-full border bg-slate-950/90 py-1 pl-1 pr-2.5 text-[9px] font-bold uppercase text-white shadow-xl" style={{ left: `${latestPoint.x}%`, top: `${latestPoint.y}%`, borderColor: `${colour}99` }}>
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[8px] text-slate-950" style={{ backgroundColor: colour }}>{activePlayer.split(/\s+/).map((part: string) => part[0]).slice(0, 2).join('')}</span>
          <span className="truncate">{activePlayer}</span><span className="truncate font-medium text-slate-400">{rawAction.replaceAll('_', ' ')}</span>
        </div>}
        <div className="live-ball absolute z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] bg-white shadow-[0_0_14px_rgba(255,255,255,.95)]" style={{ left: `${latestPoint.x}%`, top: `${latestPoint.y}%`, borderColor: colour }} />
      </>}
      {!latestPoint && <div className="absolute inset-0 grid place-items-center bg-emerald-950/20 text-xs font-semibold text-emerald-50">Waiting for positioned actions…</div>}
    </div>
    <div key={actionText(latestItem, homeTeam, awayTeam)} className="live-event-enter mt-3 rounded-xl border bg-slate-950/90 px-3 py-3 shadow-lg" style={{ borderColor: `${colour}70` }}>
      <div className="flex items-center gap-2"><i className="h-6 w-1 rounded-full" style={{ backgroundColor: colour }} /><div>
        <div className="text-[9px] font-black uppercase tracking-[.18em]" style={{ color: colour }}>{replayFrames ? 'Goal replay' : 'Live commentary'} · {teamLabel}</div>
        <div className="mt-0.5 text-sm font-bold text-white">{actionText(latestItem, homeTeam, awayTeam)}</div>
      </div></div>
    </div>
    {replayError && <div className="mt-2 rounded-lg border border-amber-700/60 bg-amber-950/30 p-2 text-xs text-amber-200">{replayError}</div>}
    {feedError && <div className="mt-2 text-xs text-red-300">{feedError}</div>}
  </section>;
}
