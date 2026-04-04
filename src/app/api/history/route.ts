import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { normalizeWeek, normalizeWeeks, isMissingWeekColumnError } from '@/lib/week-compat';

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

    // All weeks (both active and completed)
    let weeks;
    try {
      const response = await supabase
        .from('weeks')
        .select('*')
        .in('status', ['active', 'completed'])
        .order('target_date', { ascending: false })
        .order('target_kickoff_time', { ascending: false });
      if (response.error) throw response.error;
      weeks = response.data;
    } catch (error) {
      if (isMissingWeekColumnError(error)) {
        const fallback = await supabase
          .from('weeks')
          .select('*')
          .in('status', ['active', 'completed'])
          .order('saturday_date', { ascending: false });
        if (fallback.error) throw fallback.error;
        weeks = fallback.data;
      } else {
        throw error;
      }
    }

    return NextResponse.json({ weeks: normalizeWeeks(weeks) });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
