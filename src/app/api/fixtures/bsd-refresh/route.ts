import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { bsdRequest } from '@/lib/bsd-api';
import { bsdPages, bsdStatus, canonicalBsdLeague, enrichBsd, inRound, mapConcurrent, rankBsd } from '@/lib/bsd-refresh';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const deadline = Date.now() + 240000;
    const { weekId } = await request.json();
    if (!Number.isInteger(weekId) || weekId <= 0) return NextResponse.json({ error: 'Invalid round' }, { status: 400 });
    const { data: week, error: weekError } = await supabase.from('weeks').select('*').eq('id', weekId).single();
    if (weekError || !week) throw new Error(weekError?.message || 'Round not found');
    const { data: existing, error: existingError } = await supabase.from('fixtures').select('*').eq('week_id', weekId).eq('data_provider', 'bsd');
    if (existingError) throw new Error(existingError.message);
    const date = week.target_date || week.saturday_date;
    const kickoff = week.target_kickoff_time || '15:00:00';
    const leagues = (await bsdPages('/leagues/')).map(l => ({ ...l, canonical: canonicalBsdLeague(l.name || l.league_name || '') })).filter(l => l.canonical);
    let warnings = 0;
    const pages = await mapConcurrent(leagues, async l => {
      // A failed fixture list must not be treated as an empty league.
      return bsdPages('/events/', { date_from: date, date_to: date, league_id: l.id });
    });
    const events = new Map<number, any>();
    pages.flat().forEach(e => events.set(Number(e.id), e));
    // Fetch previously imported matches even when moved out of the date feed.
    await mapConcurrent(existing || [], async row => {
      if (!events.has(Number(row.bsd_event_id))) {
        try { events.set(Number(row.bsd_event_id), await bsdRequest(`/events/${row.bsd_event_id}/`, undefined, 15000)); }
        catch { warnings++; }
      }
    });
    const byId = new Map((existing || []).map(r => [Number(r.bsd_event_id), r]));
    const cache = new Map<string, Promise<any>>();
    const rows = await mapConcurrent(Array.from(events.values()), async event => {
      const id = Number(event.id);
      const old = byId.get(id);
      const leagueId = Number(event.league_id || event.league?.id);
      const league = leagues.find(l => Number(l.id) === leagueId);
      const rawDate = event.event_date || event.start_time || event.kickoff;
      if (!rawDate || (!old && (!league || !inRound(rawDate, date, kickoff, week.is_custom ? 15 : 0) || bsdStatus(event.status) === 'PST'))) return null;
      const home = event.home_team, away = event.away_team;
      const row: any = { ...(old || {}), api_fixture_id: id, provider_fixture_id: id, bsd_event_id: id, data_provider: 'bsd', week_id: weekId,
        home_team: (typeof home === 'object' ? home?.name : home) || event.home_team_name || old?.home_team || '',
        away_team: (typeof away === 'object' ? away?.name : away) || event.away_team_name || old?.away_team || '',
        home_team_id: home?.id || event.home_team_id || old?.home_team_id || null,
        away_team_id: away?.id || event.away_team_id || old?.away_team_id || null,
        home_team_logo: home?.logo || event.home_team_logo || old?.home_team_logo || null,
        away_team_logo: away?.logo || event.away_team_logo || old?.away_team_logo || null,
        league_id: leagueId || old?.league_id, league_name: league?.canonical || old?.league_name,
        kick_off: new Date(rawDate).toISOString(), match_status: bsdStatus(event.status),
        home_score: event.home_score ?? old?.home_score ?? null, away_score: event.away_score ?? old?.away_score ?? null,
        bsd_live_websocket: Boolean(event.live_websocket), bsd_websocket_plus: Boolean(event.websocket_plus),
      };
      await enrichBsd(row, event, () => warnings++, cache, deadline);
      return row;
    });
    const refreshed = rows.filter(Boolean);
    // Include retained records in ranking when an individual event lookup failed.
    for (const row of existing || []) if (!refreshed.some(r => r.bsd_event_id === row.bsd_event_id)) refreshed.push({ ...row });
    rankBsd(refreshed);
    const columns = ['api_fixture_id', 'provider_fixture_id', 'bsd_event_id', 'data_provider', 'week_id', 'home_team', 'away_team', 'home_team_id', 'away_team_id', 'home_team_logo', 'away_team_logo', 'league_id', 'league_name', 'kick_off', 'match_status', 'home_score', 'away_score', 'bsd_live_websocket', 'bsd_websocket_plus', 'home_form', 'away_form', 'home_team_position', 'away_team_position', 'over_25_prediction', 'odds_over_25', 'odds_under_25', 'is_star_pick', 'star_rank', 'star_score', 'insights_updated_at'];
    const payload = refreshed.map(row => Object.fromEntries(columns.map(k => [k, row[k] ?? null])));
    if (payload.length) {
      const { error } = await supabase.from('fixtures').upsert(payload, { onConflict: 'data_provider,provider_fixture_id' });
      if (error) throw new Error(error.message);
    }
    return NextResponse.json({ updated: refreshed.length, added: refreshed.filter(r => !byId.has(r.bsd_event_id)).length, warnings });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'BSD refresh failed' }, { status: 502 });
  }
}
