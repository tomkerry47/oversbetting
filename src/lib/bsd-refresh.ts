import 'server-only';
import { bsdRequest } from './bsd-api';
import { LEAGUE_IDS } from '@/types';

const list = (p: any): any[] => {
  const rows = p?.results || p?.events || p?.data || [];
  return Array.isArray(rows) ? rows : [];
};
const name = (v: any) => typeof v === 'string' ? v : v?.name;
export function canonicalBsdLeague(value: string) {
  const key = value.toLowerCase().replace('sky bet', '').replace(/^english /, '').replace(/^efl /, '').trim().replace(/\s+/g, ' ');
  return Object.values(LEAGUE_IDS).find(v => v.toLowerCase() === key);
}
export function bsdStatus(value: any) {
  const s = String(value || '').toLowerCase().replaceAll('_', '');
  if (['postponed', 'cancelled', 'canceled', 'pst', 'canc'].includes(s)) return 'PST';
  if (['finished', 'ft', 'ended'].includes(s)) return 'FT';
  if (['inprogress', 'live', 'halftime', 'paused'].includes(s)) return 'LIVE';
  return 'NS';
}
export async function bsdPages(path: string, params: Record<string, string | number> = {}) {
  const rows: any[] = [];
  for (let offset = 0; ; offset += 100) {
    const p = await bsdRequest(path, { ...params, limit: 100, offset }, 15000);
    const page = list(p);
    rows.push(...page);
    if (!p.next || !page.length) return rows;
    if (offset >= 9900) throw new Error('BSD pagination exceeded expected size');
  }
}
export async function mapConcurrent<T, R>(items: T[], fn: (item: T) => Promise<R>, concurrency = 4): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  }));
  return results;
}
export function inRound(date: string, targetDate: string, kickoff: string, window: number) {
  const parsed = new Date(date);
  if (!Number.isFinite(parsed.getTime())) return false;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(parsed);
  const get = (type: string) => parts.find(p => p.type === type)?.value;
  const [h, m] = kickoff.split(':').map(Number);
  return `${get('year')}-${get('month')}-${get('day')}` === targetDate && Math.abs(Number(get('hour')) * 60 + Number(get('minute')) - h * 60 - m) <= window;
}
function findNumber(node: any, keys: string[]): number | null {
  if (!node || typeof node !== 'object') return null;
  for (const [key, v] of Object.entries(node)) {
    if (keys.includes(key.toLowerCase().replace(/[-.]/g, '_')) && v !== null && typeof v !== 'boolean' && ['number', 'string'].includes(typeof v) && Number.isFinite(Number(v))) return Number(v);
  }
  for (const v of Object.values(node)) { const n = findNumber(v, keys); if (n !== null) return n; }
  return null;
}
export async function enrichBsd(row: any, event: any, warning: () => void, cache: Map<string, Promise<any>>, deadline = Infinity) {
  const cached = (key: string, call: () => Promise<any>) => {
    if (!cache.has(key)) cache.set(key, call());
    return cache.get(key)!;
  };
  const attempt = async (call: () => Promise<void>) => {
    if (Date.now() >= deadline) { warning(); return; }
    try { await call(); } catch { warning(); }
  };
  const date = String(row.kick_off).slice(0, 10);
  await attempt(async () => {
    if (!event.season_id) return;
    const p = await cached(`standings:${row.league_id}:${event.season_id}`, () => bsdRequest(`/leagues/${row.league_id}/standings/`, { season_id: event.season_id }, 10000));
    const positions = new Map((p.standings || list(p)).map((s: any) => [Number(s.team_id || s.team?.id), s.position ?? s.rank ?? null]));
    row.home_team_position = positions.get(Number(row.home_team_id)) ?? null;
    row.away_team_position = positions.get(Number(row.away_team_id)) ?? null;
  });
  for (const side of ['home', 'away']) await attempt(async () => {
    const team = row[`${side}_team_id`];
    if (!team) return;
    const p = await cached(`form:${team}:${row.league_id}:${date}`, () => bsdRequest('/events/', { team_id: team, league_id: row.league_id, status: 'finished', date_to: date, limit: 10, offset: 0 }, 10000));
    row[`${side}_form`] = list(p).filter(e => Number(e.league_id) === Number(row.league_id) && [Number(e.home_team_id), Number(e.away_team_id)].includes(Number(team)) && new Date(e.event_date).getTime() < new Date(row.kick_off).getTime())
      .sort((a, b) => String(b.event_date).localeCompare(String(a.event_date))).slice(0, 5).map(e => {
        const home = Number(e.home_team_id) === Number(team);
        const hs = Number(e.home_score || 0), as = Number(e.away_score || 0);
        const diff = home ? hs - as : as - hs;
        return { result: diff > 0 ? 'W' : diff < 0 ? 'L' : 'D', homeScore: hs, awayScore: as, opponent: name(home ? e.away_team : e.home_team), opponentPosition: null, homeAway: home ? 'H' : 'A', date: new Date(e.event_date).toLocaleDateString('en-GB', { timeZone: 'UTC' }), competition: row.league_name };
      });
  });
  await attempt(async () => {
    const p = await bsdRequest(`/events/${row.bsd_event_id}/prediction/`, undefined, 10000);
    const probability = findNumber(p, ['prob_over_25', 'over_25_probability']);
    if (probability === null) throw new Error('Missing prediction');
    row.over_25_prediction = probability;
    const goals = (p.markets || p.prediction?.markets)?.expected_goals;
    const home = findNumber(goals, ['home']), away = findNumber(goals, ['away']);
    row._expected_total_goals = home !== null && away !== null ? home + away : null;
  });
  await attempt(async () => {
    const odds = list(await bsdRequest('/odds/', { event_id: row.bsd_event_id, market: 'over_under_25', limit: 100 }, 10000));
    const consensus = odds.filter(o => o.bookmaker_slug === 'consensus');
    const selected = consensus.length ? consensus : odds;
    for (const outcome of ['over', 'under']) {
      const value = selected.find(o => String(o.outcome).toLowerCase() === outcome)?.decimal_odds;
      if (value != null && Number.isFinite(Number(value))) row[`odds_${outcome}_25`] = Number(value);
    }
  });
  row.insights_updated_at = new Date().toISOString();
}
const poisson = (mean: number) => 1 - Math.exp(-mean) * (1 + mean + mean * mean / 2);
export function rankBsd(rows: any[]) {
  const ranked: any[] = [];
  for (const row of rows) {
    row.is_star_pick = false; row.star_rank = null; row.star_score = null;
    if (row.match_status === 'PST' || row.over_25_prediction == null) continue;
    const probability = Math.max(0, Math.min(1, Number(row.over_25_prediction) / (Number(row.over_25_prediction) > 1 ? 100 : 1)));
    const components: [number, number][] = [[0.55, probability]];
    if (row._expected_total_goals != null) components.push([0.15, poisson(row._expected_total_goals)]);
    const totals = [...(row.home_form || []), ...(row.away_form || [])].filter(f => typeof f.homeScore === 'number' && typeof f.awayScore === 'number').map(f => f.homeScore + f.awayScore);
    if (totals.length) {
      components.push([0.10, poisson(totals.reduce((a, b) => a + b, 0) / totals.length)]);
      components.push([0.10, totals.filter(t => t > 2.5).length / totals.length]);
    }
    const over = Number(row.odds_over_25), under = Number(row.odds_under_25);
    if (over > 1 && under > 1) components.push([0.10, (1 / over) / (1 / over + 1 / under)]);
    row.star_score = Math.round(10000 * components.reduce((s, [w, v]) => s + w * v, 0) / components.reduce((s, [w]) => s + w, 0)) / 100;
    ranked.push(row);
  }
  ranked.sort((a, b) => b.star_score - a.star_score || a.bsd_event_id - b.bsd_event_id).slice(0, 5).forEach((r, i) => { r.is_star_pick = true; r.star_rank = i + 1; });
}
