import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getRelevantSaturday, calculateWeekNumber } from '@/lib/utils';
import { getCurrentSeason } from '@/lib/football-api';

/**
 * GET /api/weeks - Get all weeks or the current active week.
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const active = url.searchParams.get('active');

    if (active === 'true') {
      const { data: week } = await supabase
        .from('weeks')
        .select('*')
        .eq('status', 'active')
        .order('saturday_date', { ascending: false })
        .limit(1)
        .single();

      return NextResponse.json({ week });
    }

    const { data: weeks, error } = await supabase
      .from('weeks')
      .select('*')
      .order('saturday_date', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ weeks: weeks || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/weeks/reset - Mark the current week as completed and prep for next.
 */
export async function POST(request: NextRequest) {
  try {
    // Mark all active weeks as completed
    const { error: updateError } = await supabase
      .from('weeks')
      .update({ status: 'completed' })
      .eq('status', 'active');

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Week reset complete. New fixtures will load for next Saturday.' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
