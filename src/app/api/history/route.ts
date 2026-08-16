import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { normalizeWeek, normalizeWeeks, isMissingWeekColumnError } from '@/lib/week-compat';
import { getActiveRoundWindow } from '@/lib/utils';
import { GOAL_THRESHOLD, Week } from '@/types';

type SelectionGoal = {
  week_id: number;
  total_goals: number | null;
};

function addGoalSummary(week: Week, selections: SelectionGoal[]) {
  const weekSelections = selections.filter((selection) => selection.week_id === week.id);
  const recordedSelections = weekSelections.filter(
    (selection) => selection.total_goals !== null && selection.total_goals !== undefined
  );

  return {
    ...week,
    goals_scored: recordedSelections.reduce(
      // Each over-2.5 pick needs three goals. Extra goals do not increase the
      // weekly progress beyond that pick's three-goal contribution.
      (total, selection) =>
        total + Math.min(Number(selection.total_goals), GOAL_THRESHOLD + 1),
      0
    ),
    goals_target: weekSelections.length * (GOAL_THRESHOLD + 1),
    goals_recorded: recordedSelections.length,
  };
}

async function addGoalSummaries(weeks: Week[]) {
  if (weeks.length === 0) return [];

  const { data: selections, error } = await supabase
    .from('selections')
    .select('week_id,total_goals')
    .in('week_id', weeks.map((week) => week.id));

  if (error) throw error;

  return weeks.map((week) => addGoalSummary(week, selections || []));
}

async function getVisibleHistoryWeeks() {
  // Keep the previous round visible while it is still active so results can be
  // checked from History after its target date has passed.
  const { startDate, endDate } = getActiveRoundWindow(6, 7);
  try {
    const [activeResponse, completedResponse] = await Promise.all([
      supabase
        .from('weeks')
        .select('*')
        .eq('status', 'active')
        .gte('target_date', startDate)
        .lte('target_date', endDate)
        .order('target_date', { ascending: false })
        .order('target_kickoff_time', { ascending: false }),
      supabase
        .from('weeks')
        .select('*')
        .eq('status', 'completed')
        .order('target_date', { ascending: false })
        .order('target_kickoff_time', { ascending: false }),
    ]);

    if (activeResponse.error) throw activeResponse.error;
    if (completedResponse.error) throw completedResponse.error;

    return addGoalSummaries(normalizeWeeks([
      ...(activeResponse.data || []),
      ...(completedResponse.data || []),
    ]));
  } catch (error) {
    if (!isMissingWeekColumnError(error)) {
      throw error;
    }

    const [activeFallback, completedFallback] = await Promise.all([
      supabase
        .from('weeks')
        .select('*')
        .eq('status', 'active')
        .gte('saturday_date', startDate)
        .lte('saturday_date', endDate)
        .order('saturday_date', { ascending: false }),
      supabase
        .from('weeks')
        .select('*')
        .eq('status', 'completed')
        .order('saturday_date', { ascending: false }),
    ]);

    if (activeFallback.error) throw activeFallback.error;
    if (completedFallback.error) throw completedFallback.error;

    return addGoalSummaries(normalizeWeeks([
      ...(activeFallback.data || []),
      ...(completedFallback.data || []),
    ]));
  }
}

/**
 * GET /api/history - Get completed weeks with full selections and results.
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const weekId = url.searchParams.get('week_id');

    if (weekId) {
      const { data: week } = await supabase
        .from('weeks')
        .select('*')
        .eq('id', parseInt(weekId))
        .single();

      const { data: selections } = await supabase
        .from('selections')
        .select('*, fixture:fixtures(*)')
        .eq('week_id', parseInt(weekId))
        .order('player_name')
        .order('created_at');

      const { data: fines } = await supabase
        .from('fines')
        .select('*')
        .eq('week_id', parseInt(weekId));

      const normalizedWeek = normalizeWeek(week);
      return NextResponse.json({
        week: normalizedWeek
          ? addGoalSummary(normalizedWeek, selections || [])
          : null,
        selections,
        fines,
      });
    }

    const weeks = await getVisibleHistoryWeeks();
    return NextResponse.json({ weeks });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
