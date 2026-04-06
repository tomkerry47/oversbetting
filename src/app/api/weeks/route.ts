import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { isMissingWeekColumnError, normalizeWeek, normalizeWeeks } from '@/lib/week-compat';
import { getActiveRoundWindow } from '@/lib/utils';

/**
 * GET /api/weeks - Get all weeks or a filtered subset.
 * ?active=true   - Returns the single most recent active week.
 * ?upcoming=true - Returns all active weeks with target_date within the next 6 days.
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const active = url.searchParams.get('active');
    const upcoming = url.searchParams.get('upcoming');
    const { startDate, endDate } = getActiveRoundWindow(6);

    if (upcoming === 'true') {
      let weeks;
      try {
        const response = await supabase
          .from('weeks')
          .select('*')
          .eq('status', 'active')
          .gte('target_date', startDate)
          .lte('target_date', endDate)
          .order('target_date', { ascending: true })
          .order('target_kickoff_time', { ascending: true });
        if (response.error) throw response.error;
        weeks = response.data;
      } catch (error) {
        if (isMissingWeekColumnError(error)) {
          const fallback = await supabase
            .from('weeks')
            .select('*')
            .eq('status', 'active')
            .gte('saturday_date', startDate)
            .lte('saturday_date', endDate)
            .order('saturday_date', { ascending: true });
          if (fallback.error) throw fallback.error;
          weeks = fallback.data;
        } else {
          throw error;
        }
      }

      return NextResponse.json({ weeks: normalizeWeeks(weeks ?? []) });
    }

    if (active === 'true') {
      let week;
      try {
        const response = await supabase
          .from('weeks')
          .select('*')
          .eq('status', 'active')
          .gte('target_date', startDate)
          .lte('target_date', endDate)
          .order('target_date', { ascending: false })
          .order('target_kickoff_time', { ascending: false })
          .limit(1)
          .single();
        if (response.error) throw response.error;
        week = response.data;
      } catch (error) {
        if (isMissingWeekColumnError(error)) {
          const fallback = await supabase
            .from('weeks')
            .select('*')
            .eq('status', 'active')
            .gte('saturday_date', startDate)
            .lte('saturday_date', endDate)
            .order('saturday_date', { ascending: false })
            .limit(1)
            .single();
          week = fallback.data;
        } else {
          throw error;
        }
      }

      return NextResponse.json({ week: normalizeWeek(week) });
    }

    let weeks;
    try {
      const response = await supabase
        .from('weeks')
        .select('*')
        .or(`status.eq.completed,and(status.eq.active,target_date.gte.${startDate},target_date.lte.${endDate})`)
        .order('target_date', { ascending: false })
        .order('target_kickoff_time', { ascending: false });
      if (response.error) throw response.error;
      weeks = response.data;
    } catch (caughtError) {
      if (isMissingWeekColumnError(caughtError)) {
        const fallback = await supabase
          .from('weeks')
          .select('*')
          .or(`status.eq.completed,and(status.eq.active,saturday_date.gte.${startDate},saturday_date.lte.${endDate})`)
          .order('saturday_date', { ascending: false });
        if (fallback.error) throw fallback.error;
        weeks = fallback.data;
      } else {
        throw caughtError;
      }
    }

    return NextResponse.json({ weeks: normalizeWeeks(weeks) });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/weeks/reset - Mark the current week as completed and prep for next.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const weekId = body?.week_id;

    let query = supabase
      .from('weeks')
      .update({ status: 'completed' });

    if (weekId) {
      query = query.eq('id', weekId);
    } else {
      query = query.eq('status', 'active');
    }

    const { error: updateError } = await query;

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Week reset complete. New fixtures will load for next Saturday.' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
