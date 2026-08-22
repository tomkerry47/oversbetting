import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { bsdMatchStatsSnapshot, fetchBsdMatch, fetchBsdSocketMatches, hasBsdMatchStats, parseBsdMatch } from '@/lib/bsd-api';
import { fetchFixtureResults } from '@/lib/football-api';
import { getActiveRoundWindow, getRoundResultsAvailableAt } from '@/lib/utils';

export const dynamic = 'force-dynamic';
const TEN_MINUTES = 10 * 60 * 1000;
const LIVE_ROUND_RETENTION_MS = 12 * 60 * 60 * 1000;

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
    // Include the current round even after result processing marks it complete,
    // but never fall back to an old round that was accidentally left active.
    const { startDate, endDate } = getActiveRoundWindow(8, 2);
    const { data: candidateWeeks, error: weekError } = await supabase
      .from('weeks').select('*')
      .gte('target_date', startDate)
      .lte('target_date', endDate)
      .order('target_date', { ascending: true })
      .order('target_kickoff_time', { ascending: true })
      .order('week_number', { ascending: true })
      .order('id', { ascending: true });
    if (weekError) throw weekError;
    if (!candidateWeeks?.length) return NextResponse.json({ week: null, matches: [], goals: 0, target: 24 });

    const { data: selections, error } = await supabase
      .from('selections').select('*, fixture:fixtures(*)')
      .in('week_id', candidateWeeks.map((candidate: any) => candidate.id))
      .order('created_at');
    if (error) throw error;

    const selectedWeekIds = new Set((selections || []).map((selection: any) => selection.week_id));
    const now = Date.now();
    const visibleWeeks = candidateWeeks.filter((candidate: any) =>
      now < getRoundResultsAvailableAt(candidate.target_date, candidate.target_kickoff_time).getTime() + LIVE_ROUND_RETENTION_MS
    );
    const week = visibleWeeks.find((candidate: any) => selectedWeekIds.has(candidate.id)) || visibleWeeks[0];
    if (!week) return NextResponse.json({ week: null, matches: [], goals: 0, target: 24 });
    const weekSelections = (selections || []).filter((selection: any) => selection.week_id === week.id);

    const bsdEventIds = weekSelections
      .map((selection: any) => selection.fixture)
      .filter((fixture: any) => fixture?.data_provider === 'bsd' && fixture.bsd_event_id && canBeLive(fixture.kick_off))
      .map((fixture: any) => Number(fixture.bsd_event_id));
    const socketMatches: Record<number, any> = await fetchBsdSocketMatches(
      Array.from(new Set<number>(bsdEventIds))
    ).catch(() => ({}));

    const matches = await Promise.all(weekSelections.map(async (selection: any) => {
      const fixture = selection.fixture;
      let live: any = null;
      let finalStats = fixture?.final_stats ?? null;
      if (fixture?.data_provider === 'bsd' && fixture.bsd_event_id && canBeLive(fixture.kick_off)) {
        const socketEvent = socketMatches[Number(fixture.bsd_event_id)];
        live = socketEvent ? parseBsdMatch(socketEvent) : null;
        if (live) {
          const stats = bsdMatchStatsSnapshot(live);
          const update: Record<string, any> = {
            home_score: live.homeScore,
            away_score: live.awayScore,
            match_status: shortStatus(live.status),
            live_updated_at: new Date().toISOString(),
          };
          if (hasBsdMatchStats(stats)) {
            update.final_stats = stats;
            update.stats_updated_at = new Date().toISOString();
          }
          const updated = await supabase.from('fixtures').update(update).eq('id', fixture.id);
          if (updated.error && update.final_stats) {
            delete update.final_stats;
            delete update.stats_updated_at;
            await supabase.from('fixtures').update(update).eq('id', fixture.id);
          }
        }
      } else if (fixture?.data_provider === 'bsd' && fixture.bsd_event_id && fixture.match_status === 'FT' && finalStats === null) {
        // Backfill completed fixtures created before final-stat persistence.
        // Saving even an empty snapshot ensures a missing provider feed is not
        // requested again on every overview refresh.
        const archived = await fetchBsdMatch(Number(fixture.bsd_event_id)).catch(() => null);
        if (archived) {
          finalStats = bsdMatchStatsSnapshot(archived);
          await supabase.from('fixtures').update({
            final_stats: finalStats,
            stats_updated_at: new Date().toISOString(),
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
      return { ...selection, fixture: { ...fixture, home_score: homeScore, away_score: awayScore, final_stats: finalStats }, live };
    }));

    const goals = matches.reduce((sum: number, row: any) =>
      sum + Math.min(3, Number(row.fixture?.home_score || 0) + Number(row.fixture?.away_score || 0)), 0);
    return NextResponse.json({ week, matches, goals, target: 24, refreshedAt: new Date().toISOString() });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to load live matches' }, { status: 500 });
  }
}
