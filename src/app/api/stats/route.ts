import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { PLAYERS, PlayerName, PlayerStats } from '@/types';

/**
 * GET /api/stats - Get player statistics.
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const player = url.searchParams.get('player');

    // Get all selections with fixtures
    let selectionsQuery = supabase
      .from('selections')
      .select('*, fixture:fixtures(home_team, away_team, league_name, home_score, away_score)')
      .order('created_at', { ascending: true });

    if (player) {
      selectionsQuery = selectionsQuery.eq('player_name', player);
    }

    const { data: allSelections } = await selectionsQuery;

    // Get all fines
    let finesQuery = supabase.from('fines').select('*');
    if (player) {
      finesQuery = finesQuery.eq('player_name', player);
    }

    const { data: allFines } = await finesQuery;

    // Calculate stats per player
    const stats: PlayerStats[] = [];

    const playersToCalc = player
      ? [player as PlayerName]
      : [...PLAYERS];

    for (const p of playersToCalc) {
      const playerSelections = (allSelections || []).filter(
        (s) => s.player_name === p
      );
      const playerFines = (allFines || []).filter(
        (f) => f.player_name === p
      );

      const wins = playerSelections.filter((s) => s.result === 'won').length;
      const losses = playerSelections.filter((s) => s.result === 'lost').length;
      const pending = playerSelections.filter((s) => s.result === 'pending').length;
      const total = playerSelections.length;

      // Calculate streaks
      const resolved = playerSelections.filter((s) => s.result !== 'pending');
      let currentStreak = 0;
      let bestStreak = 0;
      let tempStreak = 0;

      for (const sel of resolved) {
        if (sel.result === 'won') {
          tempStreak++;
          bestStreak = Math.max(bestStreak, tempStreak);
        } else {
          tempStreak = 0;
        }
      }

      // Current streak (from the end)
      for (let i = resolved.length - 1; i >= 0; i--) {
        if (resolved[i].result === 'won') {
          currentStreak++;
        } else {
          break;
        }
      }

      const totalFineAmount = playerFines.reduce(
        (sum, f) => sum + parseFloat(f.amount),
        0
      );
      const outstandingFines = playerFines
        .filter((f) => !f.cleared)
        .reduce((sum, f) => sum + parseFloat(f.amount), 0);
      const clearedFines = playerFines
        .filter((f) => f.cleared)
        .reduce((sum, f) => sum + parseFloat(f.amount), 0);

      stats.push({
        player_name: p,
        total_selections: total,
        wins,
        losses,
        pending,
        win_rate: total > 0 ? Math.round((wins / Math.max(wins + losses, 1)) * 100) : 0,
        total_fines: totalFineAmount,
        outstanding_fines: outstandingFines,
        cleared_fines: clearedFines,
        current_streak: currentStreak,
        best_streak: bestStreak,
      });
    }

    // Get weekly breakdown
    const { data: weeks } = await supabase
      .from('weeks')
      .select('*')
      .order('saturday_date', { ascending: false });

    const weeklyBreakdown = [];
    for (const week of weeks || []) {
      const weekSelections = (allSelections || []).filter(
        (s) => s.week_id === week.id
      );
      const weekFines = (allFines || []).filter(
        (f) => f.week_id === week.id
      );

      const playerResults: Record<string, { wins: number; losses: number; pending: number }> = {};
      for (const sel of weekSelections) {
        if (!playerResults[sel.player_name]) {
          playerResults[sel.player_name] = { wins: 0, losses: 0, pending: 0 };
        }
        playerResults[sel.player_name][sel.result as 'wins' | 'losses' | 'pending']++;
      }

      weeklyBreakdown.push({
        week,
        selections: weekSelections,
        fines: weekFines,
        player_results: playerResults,
      });
    }

    return NextResponse.json({ stats, weeklyBreakdown });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
