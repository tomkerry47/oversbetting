import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { fetchSaturdayFixtures } from '@/lib/football-api';
import { getRelevantSaturday, calculateWeekNumber } from '@/lib/utils';
import { getCurrentSeason } from '@/lib/football-api';
import { LEAGUE_IDS } from '@/types';

/**
 * GET /api/fixtures - Get fixtures for the current week.
 * If none exist in DB, fetch from API and store them.
 */
export async function GET(request: NextRequest) {
  try {
    const saturdayDate = getRelevantSaturday();

    // Get or create the week
    let { data: week, error: weekError } = await supabase
      .from('weeks')
      .select('*')
      .eq('saturday_date', saturdayDate)
      .single();

    if (!week) {
      const season = getCurrentSeason();
      const weekNumber = calculateWeekNumber(saturdayDate);

      const { data: newWeek, error: createError } = await supabase
        .from('weeks')
        .insert({
          week_number: weekNumber,
          season: season,
          saturday_date: saturdayDate,
          status: 'active',
        })
        .select()
        .single();

      if (createError) {
        return NextResponse.json({ error: createError.message }, { status: 500 });
      }
      week = newWeek;
    }

    // Check if fixtures already exist for this week
    const { data: existingFixtures } = await supabase
      .from('fixtures')
      .select('*')
      .eq('week_id', week.id)
      .order('league_name', { ascending: true })
      .order('home_team', { ascending: true });

    if (existingFixtures && existingFixtures.length > 0) {
      return NextResponse.json({ week, fixtures: existingFixtures });
    }

    // Fetch from API
    const apiFixtures = await fetchSaturdayFixtures(saturdayDate);

    if (apiFixtures.length === 0) {
      return NextResponse.json({ week, fixtures: [] });
    }

    // Store fixtures in DB
    const fixtureRows = apiFixtures.map((f) => ({
      api_fixture_id: f.fixture.id,
      week_id: week!.id,
      home_team: f.teams.home.name,
      away_team: f.teams.away.name,
      home_team_logo: f.teams.home.logo,
      away_team_logo: f.teams.away.logo,
      league_name: LEAGUE_IDS[f.league.id as keyof typeof LEAGUE_IDS] || f.league.name,
      league_id: f.league.id,
      kick_off: f.fixture.date,
      home_score: f.goals.home,
      away_score: f.goals.away,
      match_status: f.fixture.status.short,
    }));

    const { data: insertedFixtures, error: insertError } = await supabase
      .from('fixtures')
      .upsert(fixtureRows, { onConflict: 'api_fixture_id' })
      .select();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ week, fixtures: insertedFixtures });
  } catch (err: any) {
    console.error('Fixtures API error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/fixtures/refresh - Force refresh fixtures from the API.
 */
export async function POST(request: NextRequest) {
  try {
    const saturdayDate = getRelevantSaturday();

    const { data: week } = await supabase
      .from('weeks')
      .select('*')
      .eq('saturday_date', saturdayDate)
      .single();

    if (!week) {
      return NextResponse.json({ error: 'No active week found' }, { status: 404 });
    }

    const apiFixtures = await fetchSaturdayFixtures(saturdayDate);

    const fixtureRows = apiFixtures.map((f) => ({
      api_fixture_id: f.fixture.id,
      week_id: week.id,
      home_team: f.teams.home.name,
      away_team: f.teams.away.name,
      home_team_logo: f.teams.home.logo,
      away_team_logo: f.teams.away.logo,
      league_name: LEAGUE_IDS[f.league.id as keyof typeof LEAGUE_IDS] || f.league.name,
      league_id: f.league.id,
      kick_off: f.fixture.date,
      home_score: f.goals.home,
      away_score: f.goals.away,
      match_status: f.fixture.status.short,
    }));

    const { data: fixtures, error } = await supabase
      .from('fixtures')
      .upsert(fixtureRows, { onConflict: 'api_fixture_id' })
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ week, fixtures });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
