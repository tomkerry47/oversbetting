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

    if (weekError && weekError.code !== 'PGRST116') {
      // PGRST116 = no rows returned, which is fine
      return NextResponse.json({ error: weekError.message }, { status: 500 });
    }

    if (!week) {
      const season = getCurrentSeason();
      const weekNumber = calculateWeekNumber(saturdayDate);

      const { data: newWeek, error: createError } = await supabase
        .from('weeks')
        .upsert({
          week_number: weekNumber,
          season: season,
          saturday_date: saturdayDate,
          status: 'active',
        }, {
          onConflict: 'saturday_date',
          ignoreDuplicates: false
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

    // No fixtures in DB - return empty array
    // User can use refresh button to fetch from API if needed
    console.log(`No fixtures in DB for ${saturdayDate}. Use refresh button to fetch.`);
    return NextResponse.json({ week, fixtures: [], message: 'No fixtures loaded yet. Click refresh to fetch from SofaScore.' });
  } catch (err: any) {
    console.error('Fixtures API error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/fixtures/refresh - Force refresh fixtures from the API.
 * Rate limited: only once per hour.
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

    // Check for existing fixtures and rate limit
    const { data: existingFixtures } = await supabase
      .from('fixtures')
      .select('created_at')
      .eq('week_id', week.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (existingFixtures) {
      const lastFetch = new Date(existingFixtures.created_at);
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      
      if (lastFetch > oneHourAgo) {
        const minutesLeft = Math.ceil((lastFetch.getTime() - oneHourAgo.getTime()) / (60 * 1000));
        return NextResponse.json(
          { error: `Please wait ${minutesLeft} more minute${minutesLeft !== 1 ? 's' : ''} before refreshing` },
          { status: 429 }
        );
      }
    }

    console.log(`Fetching fixtures from API for ${saturdayDate}`);
    const apiFixtures = await fetchSaturdayFixtures(saturdayDate);
    console.log(`API returned ${apiFixtures.length} fixtures`);

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
      console.error('DB insert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`Stored ${fixtures?.length || 0} fixtures in DB`);
    return NextResponse.json({ week, fixtures });
  } catch (err: any) {
    console.error('Fixtures refresh error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
