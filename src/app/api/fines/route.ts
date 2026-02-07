import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * GET /api/fines - Get all fines, optionally filtered by player or week.
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const player = url.searchParams.get('player');
    const weekId = url.searchParams.get('week_id');
    const clearedOnly = url.searchParams.get('cleared');

    let query = supabase
      .from('fines')
      .select('*, week:weeks(saturday_date, week_number)')
      .order('created_at', { ascending: false });

    if (player) query = query.eq('player_name', player);
    if (weekId) query = query.eq('week_id', parseInt(weekId));
    if (clearedOnly === 'true') query = query.eq('cleared', true);
    if (clearedOnly === 'false') query = query.eq('cleared', false);

    const { data: fines, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Calculate summary
    const summary: Record<string, { total: number; outstanding: number; cleared: number }> = {};
    for (const fine of fines || []) {
      if (!summary[fine.player_name]) {
        summary[fine.player_name] = { total: 0, outstanding: 0, cleared: 0 };
      }
      summary[fine.player_name].total += parseFloat(fine.amount);
      if (fine.cleared) {
        summary[fine.player_name].cleared += parseFloat(fine.amount);
      } else {
        summary[fine.player_name].outstanding += parseFloat(fine.amount);
      }
    }

    return NextResponse.json({ fines: fines || [], summary });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/fines/clear - Clear fines.
 * Body: { player_name?: string, fine_ids?: number[] }
 * If player_name provided, clears all outstanding fines for that player.
 * If fine_ids provided, clears specific fines.
 * If neither, clears ALL outstanding fines.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { player_name, fine_ids } = body;

    let query = supabase
      .from('fines')
      .update({ cleared: true })
      .eq('cleared', false);

    if (fine_ids && fine_ids.length > 0) {
      query = query.in('id', fine_ids);
    } else if (player_name) {
      query = query.eq('player_name', player_name);
    }

    const { data, error } = await query.select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      cleared_count: data?.length || 0,
      cleared_fines: data,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
