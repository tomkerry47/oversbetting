import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { fetchBsdLiveEvents, parseBsdMatch } from '@/lib/bsd-api';
import { getActiveRoundWindow, getRoundResultsAvailableAt } from '@/lib/utils';

export const dynamic = 'force-dynamic';
const LIVE_ROUND_RETENTION_MS = 12 * 60 * 60 * 1000;

export async function GET() {
  try {
    const { startDate, endDate } = getActiveRoundWindow(8, 2);
    const { data: candidateWeeks, error: weekError } = await supabase
      .from('weeks')
      .select('id,target_date,target_kickoff_time')
      .gte('target_date', startDate)
      .lte('target_date', endDate)
      .order('target_date', { ascending: true })
      .order('target_kickoff_time', { ascending: true });
    if (weekError) throw weekError;
    if (!candidateWeeks?.length) return NextResponse.json({ matches: [], goals: 0, target: 24 });

    const { data: selections, error } = await supabase
      .from('selections')
      .select('id,week_id,player_name,fixture_id,fixture:fixtures(id,home_team,away_team,kick_off,home_score,away_score,match_status,data_provider,bsd_event_id)')
      .in('week_id', candidateWeeks.map((candidate: any) => candidate.id))
      .order('created_at');
    if (error) throw error;

    const selectedWeekIds = new Set((selections || []).map((selection: any) => selection.week_id));
    const now = Date.now();
    const visibleWeeks = candidateWeeks.filter((candidate: any) =>
      now < getRoundResultsAvailableAt(candidate.target_date, candidate.target_kickoff_time).getTime() + LIVE_ROUND_RETENTION_MS
    );
    const week = visibleWeeks.find((candidate: any) => selectedWeekIds.has(candidate.id)) || visibleWeeks[0];
    const weekSelections = week
      ? (selections || []).filter((selection: any) => selection.week_id === week.id)
      : [];

    const liveEvents = await fetchBsdLiveEvents().catch(() => []);
    const liveByEventId = new Map<number, any>(
      liveEvents.map((event: any) => [Number(event.id), event])
    );

    const matches = weekSelections.map((selection: any) => {
      const fixture = selection.fixture;
      const liveEvent = fixture?.bsd_event_id ? liveByEventId.get(Number(fixture.bsd_event_id)) : null;
      const live = liveEvent ? parseBsdMatch(liveEvent) : null;
      return {
        ...selection,
        fixture: {
          ...fixture,
          home_score: live?.homeScore ?? fixture?.home_score ?? 0,
          away_score: live?.awayScore ?? fixture?.away_score ?? 0,
        },
        live,
      };
    });
    const goals = matches.reduce((sum: number, row: any) =>
      sum + Math.min(3, Number(row.fixture?.home_score || 0) + Number(row.fixture?.away_score || 0)), 0);

    return NextResponse.json({ matches, goals, target: 24, scoreOnly: true, refreshedAt: new Date().toISOString() });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to refresh live scores' }, { status: 500 });
  }
}
