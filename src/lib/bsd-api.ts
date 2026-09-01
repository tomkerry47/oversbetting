import 'server-only';
import WebSocket from 'ws';

const BSD_BASE = 'https://sports.bzzoiro.com/api/v2';

function token() {
  const value = process.env.BZZOIRO_API_TOKEN || process.env.bsd_event_id;
  if (!value) throw new Error('BZZOIRO_API_TOKEN is not configured');
  return value;
}

export function createBsdLiveEventStream(eventId: number) {
  const encoder = new TextEncoder();
  let socket: WebSocket | null = null;
  let keepAlive: NodeJS.Timeout | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (payload: any) => {
        if (!closed) controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };
      const finish = () => {
        if (closed) return;
        closed = true;
        if (keepAlive) clearInterval(keepAlive);
        try { controller.close(); } catch { /* Stream may already be cancelled. */ }
      };
      socket = new WebSocket('wss://sports.bzzoiro.com/live/football/', ['token', token()]);
      socket.on('open', () => {
        socket?.send(JSON.stringify({ action: 'subscribe', event_id: eventId }));
        keepAlive = setInterval(() => {
          if (!closed) controller.enqueue(encoder.encode(': keepalive\n\n'));
        }, 15_000);
      });
      socket.on('message', (raw) => {
        try {
          const message = JSON.parse(raw.toString());
          if (message.type === 'ping') {
            socket?.send(JSON.stringify({ action: 'ping' }));
            return;
          }
          if (message.type === 'subscribed') {
            send({ type: 'snapshot', source: message.source, event: message.event, history: message.history || [], livedata: message.livedata || [] });
          } else if (['action', 'poem', 'livedata', 'event', 'error'].includes(message.type)) {
            send(message);
          }
        } catch { /* Ignore provider frames that are not JSON. */ }
      });
      socket.on('error', finish);
      socket.on('close', finish);
    },
    cancel() {
      if (keepAlive) clearInterval(keepAlive);
      socket?.close();
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

export async function bsdRequest(path: string, params?: Record<string, string | number>) {
  const url = new URL(`${BSD_BASE}${path}`);
  Object.entries(params || {}).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  const response = await fetch(url, {
    headers: { Authorization: `Token ${token()}`, Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`BSD ${response.status}: ${body.slice(0, 180)}`);
  }
  return response.json();
}

export function numberAt(object: any, paths: string[][]): number | null {
  for (const path of paths) {
    let value = object;
    for (const key of path) value = value?.[key];
    if (value !== null && value !== undefined && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function personName(value: any): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return value?.name || value?.short_name || value?.display_name || null;
}

export function parseBsdKeyEvents(incidentsPayload: any) {
  const raw = incidentsPayload?.incidents || incidentsPayload?.results || incidentsPayload?.data || incidentsPayload || [];
  if (!Array.isArray(raw)) return [];
  return raw.map((incident: any, index: number) => {
    const type = String(incident.type || incident.incident_type || incident.event || '').toLowerCase().replaceAll('_', '-');
    const cardType = String(incident.card_type || incident.card || type).toLowerCase().replaceAll('_', '-');
    const isGoal = type.includes('goal');
    const isCard = type.includes('card') || ['yellow', 'red', 'second-yellow'].includes(type);
    const isSubstitution = type.includes('substitution') || type === 'sub';
    if (!isGoal && !isCard && !isSubstitution && type !== 'var') return null;
    const player = personName(incident.player) || personName(incident.player_in) || personName(incident.in);
    const minute = numberAt(incident, [['minute'], ['time', 'minute']]);
    const addedTime = numberAt(incident, [['added_time'], ['injury_time']]);
    return {
      id: incident.id || `${type}-${minute ?? 'na'}-${player || index}`,
      type: isGoal ? 'goal' : isCard ? (cardType.includes('red') || cardType.includes('second-yellow') ? 'red-card' : 'yellow-card') : isSubstitution ? 'substitution' : 'var',
      minute,
      addedTime,
      player,
      playerId: numberAt(incident, [['player_id'], ['player_in_id']]),
      assist: personName(incident.assist),
      assistId: numberAt(incident, [['assist_id']]),
      playerOut: personName(incident.player_out) || personName(incident.out),
      playerOutId: numberAt(incident, [['player_out_id']]),
      team: incident.is_home === true ? 'home' : incident.is_home === false ? 'away' : incident.team || incident.side || null,
      homeScore: numberAt(incident, [['home_score'], ['score', 'home']]),
      awayScore: numberAt(incident, [['away_score'], ['score', 'away']]),
      goalType: incident.goal_type || null,
    };
  }).filter(Boolean).sort((a: any, b: any) =>
    Number(a.minute ?? 999) - Number(b.minute ?? 999) || Number(a.addedTime || 0) - Number(b.addedTime || 0));
}

export function parseBsdMatch(eventPayload: any, statsPayload?: any, incidentsPayload?: any) {
  const event = eventPayload?.event || eventPayload?.data || eventPayload || {};
  const stats = statsPayload?.stats || statsPayload?.data?.stats || statsPayload?.data || statsPayload || event?.stats || {};
  const homeStats = stats?.home || stats?.home_team || {};
  const awayStats = stats?.away || stats?.away_team || {};
  const incidents = incidentsPayload?.incidents || incidentsPayload?.results || incidentsPayload?.data || [];
  return {
    liveWebsocket: Boolean(event.live_websocket),
    websocketPlus: Boolean(event.websocket_plus),
    homeScore: numberAt(event, [['home_score'], ['score', 'home'], ['scores', 'home']]),
    awayScore: numberAt(event, [['away_score'], ['score', 'away'], ['scores', 'away']]),
    status: event.status || event.match_status || event.time?.status || 'notstarted',
    minute: numberAt(event, [['current_minute'], ['minute'], ['clock', 'minute'], ['time', 'minute']]),
    second: numberAt(event, [['current_second'], ['second'], ['clock', 'second'], ['time', 'second']]),
    clockDisplay: event.time?.display || event.clock?.display || null,
    period: numberAt(event, [['period'], ['time', 'period']]),
    injuryTime: numberAt(event, [['injury_time'], ['time', 'injury_time']]),
    clockUpdatedAt: Date.now(),
    homeShotsOnTarget: numberAt(homeStats, [['shots_on_target'], ['shotsOnTarget']]),
    awayShotsOnTarget: numberAt(awayStats, [['shots_on_target'], ['shotsOnTarget']]),
    homeShots: numberAt(homeStats, [['shots_total'], ['total_shots'], ['shots']]),
    awayShots: numberAt(awayStats, [['shots_total'], ['total_shots'], ['shots']]),
    homeBigChances: numberAt(homeStats, [['big_chances']]),
    awayBigChances: numberAt(awayStats, [['big_chances']]),
    homeXg: numberAt(homeStats, [['xg', 'actual'], ['xg'], ['expected_goals'], ['expectedGoals']]),
    awayXg: numberAt(awayStats, [['xg', 'actual'], ['xg'], ['expected_goals'], ['expectedGoals']]),
    xgEstimated: Boolean(homeStats?.xg?.estimated || awayStats?.xg?.estimated || statsPayload?.xg_estimated),
    homePossession: numberAt(homeStats, [['possession'], ['ball_possession']]),
    awayPossession: numberAt(awayStats, [['possession'], ['ball_possession']]),
    homeCorners: numberAt(homeStats, [['corners'], ['corner_kicks']]),
    awayCorners: numberAt(awayStats, [['corners'], ['corner_kicks']]),
    homePassAccuracy: numberAt(homeStats, [['pass_accuracy_pct']]),
    awayPassAccuracy: numberAt(awayStats, [['pass_accuracy_pct']]),
    homeFouls: numberAt(homeStats, [['fouls']]),
    awayFouls: numberAt(awayStats, [['fouls']]),
    homeHitWoodwork: numberAt(homeStats, [['hit_woodwork']]),
    awayHitWoodwork: numberAt(awayStats, [['hit_woodwork']]),
    shotmap: statsPayload?.shotmap || stats?.shotmap || [],
    momentum: statsPayload?.momentum || stats?.momentum || [],
    incidents: Array.isArray(incidents) ? incidents : [],
    keyEvents: parseBsdKeyEvents(incidents),
  };
}

export function bsdMatchStatsSnapshot(match: any) {
  return {
    homeShotsOnTarget: match.homeShotsOnTarget ?? null,
    awayShotsOnTarget: match.awayShotsOnTarget ?? null,
    homeShots: match.homeShots ?? null,
    awayShots: match.awayShots ?? null,
    homeXg: match.homeXg ?? null,
    awayXg: match.awayXg ?? null,
    homePossession: match.homePossession ?? null,
    awayPossession: match.awayPossession ?? null,
    homeCorners: match.homeCorners ?? null,
    awayCorners: match.awayCorners ?? null,
    homeBigChances: match.homeBigChances ?? null,
    awayBigChances: match.awayBigChances ?? null,
    homePassAccuracy: match.homePassAccuracy ?? null,
    awayPassAccuracy: match.awayPassAccuracy ?? null,
    homeFouls: match.homeFouls ?? null,
    awayFouls: match.awayFouls ?? null,
    homeHitWoodwork: match.homeHitWoodwork ?? null,
    awayHitWoodwork: match.awayHitWoodwork ?? null,
    xgEstimated: Boolean(match.xgEstimated),
  };
}

export function hasBsdMatchStats(stats: any) {
  return [
    stats?.homeShotsOnTarget, stats?.awayShotsOnTarget,
    stats?.homeShots, stats?.awayShots,
    stats?.homeXg, stats?.awayXg,
    stats?.homePossession, stats?.awayPossession,
    stats?.homeCorners, stats?.awayCorners,
  ].some((value) => value !== null && value !== undefined);
}

export async function fetchBsdScore(eventId: number) {
  return parseBsdMatch(await bsdRequest(`/events/${eventId}/`));
}

export async function fetchBsdStats(eventId: number) {
  return parseBsdMatch({}, await bsdRequest(`/events/${eventId}/stats/`));
}

export async function fetchBsdMatch(eventId: number, includeTimeline = false, includeStats = true) {
  const [event, stats, incidents, socket] = await Promise.all([
    bsdRequest(`/events/${eventId}/`),
    includeStats ? bsdRequest(`/events/${eventId}/stats/`).catch(() => ({})) : Promise.resolve({}),
    includeTimeline ? bsdRequest(`/events/${eventId}/incidents/`).catch(() => ({})) : Promise.resolve({}),
    includeTimeline ? fetchBsdSocketSnapshot(eventId).catch(() => ({ actions: [], event: null })) : Promise.resolve({ actions: [], event: null }),
  ]);
  const base = parseBsdMatch(event, stats, incidents);
  const realtime = socket.event ? parseBsdMatch(socket.event) : null;
  return {
    ...base,
    homeScore: realtime?.homeScore ?? base.homeScore,
    awayScore: realtime?.awayScore ?? base.awayScore,
    minute: realtime?.minute ?? base.minute,
    second: realtime?.second ?? base.second,
    clockDisplay: realtime?.clockDisplay ?? base.clockDisplay,
    period: realtime?.period ?? base.period,
    injuryTime: realtime?.injuryTime ?? base.injuryTime,
    clockUpdatedAt: realtime?.clockUpdatedAt ?? base.clockUpdatedAt,
    status: realtime?.status || base.status,
    actions: socket.actions,
  };
}

export function fetchBsdSocketSnapshot(eventId: number): Promise<{ actions: any[]; event: any }> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket('wss://sports.bzzoiro.com/live/football/', ['token', token()]);
    const actions: any[] = [];
    let event: any = null;
    let settled = false;
    let finishTimer: NodeJS.Timeout | undefined;
    const hardTimer = setTimeout(() => finish(new Error('BSD WebSocket snapshot timed out')), 5000);
    function finish(error?: Error) {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimer);
      if (finishTimer) clearTimeout(finishTimer);
      socket.close();
      if (error && actions.length === 0 && !event) reject(error);
      else resolve({ actions: actions.slice(-1500), event });
    }
    socket.on('open', () => socket.send(JSON.stringify({ action: 'subscribe', event_id: eventId })));
    socket.on('message', (raw) => {
      try {
        const message = JSON.parse(raw.toString());
        if (message.type === 'ping') socket.send(JSON.stringify({ action: 'ping' }));
        if (message.type === 'event') event = message.event || message.data || message;
        if (message.type === 'subscribed' && message.event) event = message.event;
        if (message.type === 'action' || message.type === 'poem' || message.type === 'livedata') actions.push(message);
        const history = message.actions || message.history || message.data?.actions;
        if (Array.isArray(history)) actions.push(...history);
        clearTimeout(finishTimer);
        finishTimer = setTimeout(() => finish(), 750);
      } catch { /* Ignore provider keepalive frames that are not JSON. */ }
    });
    socket.on('error', (cause) => finish(cause instanceof Error ? cause : new Error('BSD WebSocket error')));
    socket.on('close', () => finish());
  });
}

function fetchBsdSocketMatchBatch(eventIds: number[]): Promise<Record<number, any>> {
  if (eventIds.length === 0) return Promise.resolve({});
  return new Promise((resolve) => {
    const socket = new WebSocket('wss://sports.bzzoiro.com/live/football/', ['token', token()]);
    const events: Record<number, any> = {};
    const requested = eventIds;
    const completed = new Set<number>();
    let settled = false;
    let finishTimer: NodeJS.Timeout | undefined;
    const hardTimer = setTimeout(finish, 4000);
    function finish() {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimer);
      if (finishTimer) clearTimeout(finishTimer);
      socket.close();
      resolve(events);
    }
    socket.on('open', () => requested.forEach((eventId) =>
      socket.send(JSON.stringify({ action: 'subscribe', event_id: eventId }))));
    socket.on('message', (raw) => {
      try {
        const message = JSON.parse(raw.toString());
        if (message.type === 'ping') socket.send(JSON.stringify({ action: 'ping' }));
        const eventId = Number(message.event_id || message.event?.id || message.data?.id);
        if (eventId && message.type === 'subscribed') {
          if (message.event) events[eventId] = message.event;
          completed.add(eventId);
        }
        if (eventId && message.type === 'event') events[eventId] = message.event || message.data || message;
        if (eventId && message.type === 'error') completed.add(eventId);
        if (completed.size >= requested.length) finish();
        else if (message.type !== 'ping' && message.type !== 'pong') {
          clearTimeout(finishTimer);
          finishTimer = setTimeout(finish, 750);
        }
      } catch { /* Ignore non-JSON keepalive frames. */ }
    });
    socket.on('error', finish);
    socket.on('close', finish);
  });
}

export async function fetchBsdSocketMatches(eventIds: number[]): Promise<Record<number, any>> {
  const uniqueIds = Array.from(new Set(eventIds));
  const batches: number[][] = [];
  for (let index = 0; index < uniqueIds.length; index += 10) {
    batches.push(uniqueIds.slice(index, index + 10));
  }
  const results = await Promise.all(batches.map(fetchBsdSocketMatchBatch));
  return Object.assign({}, ...results);
}
