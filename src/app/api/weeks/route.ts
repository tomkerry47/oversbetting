import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { isMissingWeekColumnError, normalizeWeek, normalizeWeeks } from '@/lib/week-compat';

/**
 * GET /api/weeks - Get all weeks or the current active week.
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const active = url.searchParams.get('active');

    if (active === 'true') {
      let week;
      try {
        const response = await supabase
          .from('weeks')
          .select('*')
          .eq('status', 'active')
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
        .order('target_date', { ascending: false })
        .order('target_kickoff_time', { ascending: false });
      if (response.error) throw response.error;
      weeks = response.data;
    } catch (caughtError) {
      if (isMissingWeekColumnError(caughtError)) {
        const fallback = await supabase
          .from('weeks')
          .select('*')
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
