import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { normalizeWeek, normalizeWeeks, isMissingWeekColumnError } from '@/lib/week-compat';

async function getVisibleHistoryWeeks() {
  try {
    const [activeResponse, completedResponse] = await Promise.all([
      supabase
        .from('weeks')
        .select('*')
        .eq('status', 'active')
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

    return normalizeWeeks([
      ...(activeResponse.data || []),
      ...(completedResponse.data || []),
    ]);
  } catch (error) {
    if (!isMissingWeekColumnError(error)) {
      throw error;
    }

    const [activeFallback, completedFallback] = await Promise.all([
      supabase
        .from('weeks')
        .select('*')
        .eq('status', 'active')
        .order('saturday_date', { ascending: false }),
      supabase
        .from('weeks')
        .select('*')
        .eq('status', 'completed')
        .order('saturday_date', { ascending: false }),
    ]);

    if (activeFallback.error) throw activeFallback.error;
    if (completedFallback.error) throw completedFallback.error;

    return normalizeWeeks([
      ...(activeFallback.data || []),
      ...(completedFallback.data || []),
    ]);
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

      return NextResponse.json({ week: normalizeWeek(week), selections, fines });
    }

    const weeks = await getVisibleHistoryWeeks();
    return NextResponse.json({ weeks });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
