import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { fetchBsdSocketMatches, parseBsdMatch } from '@/lib/bsd-api';
import { fetchFixtureResults } from '@/lib/football-api';

export const dynamic = 'force-dynamic';
const TEN_MINUTES = 10 * 60 * 1000;

function canBeLive(kickOff: string) {
  const delta = Date.now() - new Date(kickOff).getTime();
  return delta >= -15 * 60 * 1000 && delta <= 4 * 60 * 60 * 1000;
}

function shortStatus(value: unknown) {
  const status = String(value || '').toLowerCase().replaceAll('_', '');
  if (['finished', 'ft', 'ended'].includes(status)) return 'FT';
  if (['inprogress', 'live', '1sthalf', '2ndhalf', 'halftime', 'extratime', 'penalties', 'paused'].includes(status)) return 'LIVE';
  if (['postponed', 'cancelled', 'canceled'].includes(status)) return 'PST';
  return 'NS';
}

export async function GET() {
  try {
    const { data: week, error: weekError } = await supabase
      .from('weeks').select('*').eq('status', 'active')
      .order('target_date', { ascending: false }).limit(1).maybeSingle();
    if (weekError) throw weekError;
    if (!week) return NextResponse.json({ week: null, matches: [], goals: 0, target: 24 });

    const { data: selections, error } = await supabase
      .from('selections').select('*, fixture:fixtures(*)').eq('week_id', week.id).order('created_at');
    if (error) throw error;

    const bsdEventIds = (selections || [])
      .map((selection: any) => selection.fixture)
      .filter((fixture: any) => fixture?.data_provider === 'bsd' && fixture.bsd_event_id && canBeLive(fixture.kick_off))
      .map((fixture: any) => Number(fixture.bsd_event_id));
    const socketMatches: Record<number, any> = await fetchBsdSocketMatches(
      Array.from(new Set<number>(bsdEventIds))
    ).catch(() => ({}));

    const matches = await Promise.all((selections || []).map(async (selection: any) => {
      const fixture = selection.fixture;
      let live: any = null;
      if (fixture?.data_provider === 'bsd' && fixture.bsd_event_id && canBeLive(fixture.kick_off)) {
        const socketEvent = socketMatches[Number(fixture.bsd_event_id)];
        live = socketEvent ? parseBsdMatch(socketEvent) : null;
        if (live) {
          await supabase.from('fixtures').update({
            home_score: live.homeScore,
            away_score: live.awayScore,
            match_status: shortStatus(live.status),
            live_updated_at: new Date().toISOString(),
          }).eq('id', fixture.id);
        }
      } else if (fixture?.data_provider !== 'bsd' && canBeLive(fixture.kick_off)) {
        const due = !fixture.live_updated_at || Date.now() - new Date(fixture.live_updated_at).getTime() >= TEN_MINUTES;
        if (due) {
          const [result] = await fetchFixtureResults([fixture.provider_fixture_id || fixture.api_fixture_id]).catch(() => []);
          if (result) {
            live = {
              homeScore: result.goals.home, awayScore: result.goals.away,
              status: result.fixture.status.short,
            };
            await supabase.from('fixtures').update({
              home_score: result.goals.home, away_score: result.goals.away,
              match_status: result.fixture.status.short,
              live_updated_at: new Date().toISOString(),
            }).eq('id', fixture.id);
          }
        }
      }
      const homeScore = live?.homeScore ?? fixture?.home_score ?? 0;
      const awayScore = live?.awayScore ?? fixture?.away_score ?? 0;
      return { ...selection, fixture: { ...fixture, home_score: homeScore, away_score: awayScore }, live };
    }));

    const goals = matches.reduce((sum: number, row: any) =>
      sum + Math.min(3, Number(row.fixture?.home_score || 0) + Number(row.fixture?.away_score || 0)), 0);
    return NextResponse.json({ week, matches, goals, target: 24, refreshedAt: new Date().toISOString() });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to load live matches' }, { status: 500 });
  }
}
