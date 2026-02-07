import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { fetchFixtureResults } from '@/lib/football-api';
import { GOAL_THRESHOLD } from '@/types';

/**
 * POST /api/results - Check results for the current week's selections.
 * Fetches latest scores from the API and updates selections + calculates fines.
 */
export async function POST(request: NextRequest) {
  try {
    // Get active week
    const { data: week } = await supabase
      .from('weeks')
      .select('*')
      .eq('status', 'active')
      .order('saturday_date', { ascending: false })
      .limit(1)
      .single();

    if (!week) {
      return NextResponse.json({ error: 'No active week found' }, { status: 404 });
    }

    // Get all fixtures for the week
    const { data: fixtures } = await supabase
      .from('fixtures')
      .select('*')
      .eq('week_id', week.id);

    if (!fixtures || fixtures.length === 0) {
      return NextResponse.json({ error: 'No fixtures found for this week' }, { status: 404 });
    }

    // Fetch latest results from API
    const apiFixtureIds = fixtures.map((f) => f.api_fixture_id);
    const apiResults = await fetchFixtureResults(apiFixtureIds);

    // Update fixture scores in DB
    for (const result of apiResults) {
      await supabase
        .from('fixtures')
        .update({
          home_score: result.goals.home,
          away_score: result.goals.away,
          match_status: result.fixture.status.short,
        })
        .eq('api_fixture_id', result.fixture.id);
    }

    // Re-fetch updated fixtures
    const { data: updatedFixtures } = await supabase
      .from('fixtures')
      .select('*')
      .eq('week_id', week.id);

    // Get all selections for the week
    const { data: selections } = await supabase
      .from('selections')
      .select('*, fixture:fixtures(*)')
      .eq('week_id', week.id);

    if (!selections) {
      return NextResponse.json({ error: 'No selections found' }, { status: 404 });
    }

    // Update each selection result
    const fineEntries: Array<{
      week_id: number;
      player_name: string;
      amount: number;
      reason: string;
      fixture_id: number;
    }> = [];

    // Track player 0-0 games for double-0-0 fine
    const playerZeroZero: Record<string, number[]> = {};

    for (const sel of selections) {
      const fixture = sel.fixture;
      if (!fixture || fixture.home_score === null || fixture.away_score === null) {
        continue; // Match not finished yet
      }

      // FT, AET, or PEN statuses indicate match is complete
      const completedStatuses = ['FT', 'AET', 'PEN'];
      if (!completedStatuses.includes(fixture.match_status)) {
        continue;
      }

      const totalGoals = fixture.home_score + fixture.away_score;
      const won = totalGoals > GOAL_THRESHOLD;

      // Update selection result
      await supabase
        .from('selections')
        .update({
          result: won ? 'won' : 'lost',
          total_goals: totalGoals,
        })
        .eq('id', sel.id);

      // Check for fines
      if (totalGoals === 0) {
        // 0-0 = £5 fine
        fineEntries.push({
          week_id: week.id,
          player_name: sel.player_name,
          amount: 5,
          reason: `0-0: ${fixture.home_team} vs ${fixture.away_team}`,
          fixture_id: fixture.id,
        });

        if (!playerZeroZero[sel.player_name]) {
          playerZeroZero[sel.player_name] = [];
        }
        playerZeroZero[sel.player_name].push(fixture.id);
      } else if (totalGoals === 1) {
        // 1 goal total = £2 fine
        fineEntries.push({
          week_id: week.id,
          player_name: sel.player_name,
          amount: 2,
          reason: `1 goal: ${fixture.home_team} ${fixture.home_score}-${fixture.away_score} ${fixture.away_team}`,
          fixture_id: fixture.id,
        });
      }
    }

    // Check for both games 0-0 (£20 fine - replaces the two £5 fines)
    for (const [player, fixtureIds] of Object.entries(playerZeroZero)) {
      if (fixtureIds.length >= 2) {
        // Remove the two individual £5 fines
        const zeroFines = fineEntries.filter(
          (f) => f.player_name === player && f.amount === 5
        );
        for (const zf of zeroFines) {
          const idx = fineEntries.indexOf(zf);
          if (idx > -1) fineEntries.splice(idx, 1);
        }
        // Add the £20 both-0-0 fine
        fineEntries.push({
          week_id: week.id,
          player_name: player,
          amount: 20,
          reason: 'Both games 0-0! 💀',
          fixture_id: fixtureIds[0],
        });
      }
    }

    // Clear existing fines for this week (in case of re-check) then insert new ones
    if (fineEntries.length > 0) {
      await supabase
        .from('fines')
        .delete()
        .eq('week_id', week.id)
        .eq('cleared', false);

      await supabase.from('fines').insert(fineEntries);
    }

    // Fetch final state
    const { data: finalSelections } = await supabase
      .from('selections')
      .select('*, fixture:fixtures(*)')
      .eq('week_id', week.id)
      .order('player_name')
      .order('created_at');

    const { data: weekFines } = await supabase
      .from('fines')
      .select('*')
      .eq('week_id', week.id);

    return NextResponse.json({
      week,
      selections: finalSelections,
      fines: weekFines,
    });
  } catch (err: any) {
    console.error('Results API error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
