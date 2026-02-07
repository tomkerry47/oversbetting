import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { PLAYERS, MAX_SELECTIONS_PER_PLAYER, PlayerName } from '@/types';

/**
 * GET /api/selections - Get all selections for the current active week.
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const weekId = url.searchParams.get('week_id');

    let query = supabase
      .from('selections')
      .select('*, fixture:fixtures(*)')
      .order('player_name', { ascending: true })
      .order('created_at', { ascending: true });

    if (weekId) {
      query = query.eq('week_id', parseInt(weekId));
    } else {
      // Get the active week
      const { data: week } = await supabase
        .from('weeks')
        .select('*')
        .eq('status', 'active')
        .order('saturday_date', { ascending: false })
        .limit(1)
        .single();

      if (!week) {
        return NextResponse.json({ selections: [], week: null });
      }

      query = query.eq('week_id', week.id);
    }

    const { data: selections, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ selections: selections || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/selections - Submit selections for a player.
 * Body: { player_name: string, fixture_ids: number[], week_id: number }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { player_name, fixture_ids, week_id } = body;

    // Validate player
    if (!PLAYERS.includes(player_name as PlayerName)) {
      return NextResponse.json(
        { error: `Invalid player name. Must be one of: ${PLAYERS.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate selection count
    if (!fixture_ids || fixture_ids.length !== MAX_SELECTIONS_PER_PLAYER) {
      return NextResponse.json(
        { error: `Must select exactly ${MAX_SELECTIONS_PER_PLAYER} fixtures` },
        { status: 400 }
      );
    }

    // Check week exists and is active
    const { data: week } = await supabase
      .from('weeks')
      .select('*')
      .eq('id', week_id)
      .eq('status', 'active')
      .single();

    if (!week) {
      return NextResponse.json(
        { error: 'Week not found or already completed' },
        { status: 400 }
      );
    }

    // Check player hasn't already submitted for this week
    const { data: existing } = await supabase
      .from('selections')
      .select('id')
      .eq('week_id', week_id)
      .eq('player_name', player_name);

    if (existing && existing.length > 0) {
      // Delete existing selections to allow re-submission
      await supabase
        .from('selections')
        .delete()
        .eq('week_id', week_id)
        .eq('player_name', player_name);
    }

    // Insert new selections
    const selectionRows = fixture_ids.map((fid: number) => ({
      week_id,
      player_name,
      fixture_id: fid,
      result: 'pending',
    }));

    const { data: selections, error } = await supabase
      .from('selections')
      .insert(selectionRows)
      .select('*, fixture:fixtures(*)');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ selections });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * DELETE /api/selections - Clear a player's selections for a week.
 * Body: { player_name: string, week_id: number }
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { player_name, week_id } = body;

    const { error } = await supabase
      .from('selections')
      .delete()
      .eq('week_id', week_id)
      .eq('player_name', player_name);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
