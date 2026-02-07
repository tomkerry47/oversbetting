import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

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

      return NextResponse.json({ week, selections, fines });
    }

    // All completed weeks
    const { data: weeks } = await supabase
      .from('weeks')
      .select('*')
      .eq('status', 'completed')
      .order('saturday_date', { ascending: false });

    return NextResponse.json({ weeks: weeks || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
