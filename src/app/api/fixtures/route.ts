import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { fetchFixturesForSlot } from '@/lib/football-api';
import { getRelevantSaturday, calculateWeekNumber, getSaturdayForTargetDate, normalizeKickoffTime } from '@/lib/utils';
import { getCurrentSeason } from '@/lib/football-api';
import { LEAGUE_IDS } from '@/types';
import { isMissingWeekColumnError, normalizeWeek } from '@/lib/week-compat';

function parseRoundQuery(searchParams: URLSearchParams) {
  const weekId = searchParams.get('weekId');
  const targetDate = searchParams.get('targetDate');
  const kickoffTime = searchParams.get('kickoffTime');
  const weekOffset = parseInt(searchParams.get('weekOffset') || '0');

  if (weekId) {
    return {
      mode: 'existing' as const,
      weekId: parseInt(weekId, 10),
    };
  }

  if (targetDate && kickoffTime) {
    const normalizedKickoffTime = normalizeKickoffTime(kickoffTime);
    const saturdayDate = getSaturdayForTargetDate(targetDate);
    return {
      mode: 'custom' as const,
      isCustom: true,
      targetDate,
      kickoffTime: normalizedKickoffTime,
      saturdayDate,
      season: getCurrentSeason(targetDate),
      weekNumber: calculateWeekNumber(saturdayDate),
      weekOffset: 0,
    };
  }

  const saturdayDate = getRelevantSaturday(weekOffset);
  return {
    mode: 'standard' as const,
    isCustom: false,
    targetDate: saturdayDate,
    kickoffTime: '15:00:00',
    saturdayDate,
    season: getCurrentSeason(saturdayDate),
    weekNumber: calculateWeekNumber(saturdayDate),
    weekOffset,
  };
}

function isSaturdayDateUniqueConstraintError(error: unknown): boolean {
  const message = String((error as { message?: string })?.message || error || '').toLowerCase();
  return (
    message.includes('duplicate key value violates unique constraint "weeks_saturday_date_key"') ||
    message.includes('weeks_saturday_date_key')
  );
}

async function getOrCreateWeek(searchParams: URLSearchParams) {
  const round = parseRoundQuery(searchParams);

  if (round.mode === 'existing') {
    const { data: existingWeek, error } = await supabase
      .from('weeks')
      .select('*')
      .eq('id', round.weekId)
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const normalizedExistingWeek = normalizeWeek(existingWeek);
    if (!normalizedExistingWeek) {
      throw new Error('Week not found');
    }

    return {
      week: normalizedExistingWeek,
      round: {
        mode: normalizedExistingWeek.is_custom ? 'custom' as const : 'standard' as const,
        isCustom: normalizedExistingWeek.is_custom,
        targetDate: normalizedExistingWeek.target_date,
        kickoffTime: normalizeKickoffTime(normalizedExistingWeek.target_kickoff_time),
        saturdayDate: normalizedExistingWeek.saturday_date,
        season: normalizedExistingWeek.season,
        weekNumber: normalizedExistingWeek.week_number,
        weekOffset: 0,
        weekId: normalizedExistingWeek.id,
      },
    };
  }

  let week;
  let weekError;
  try {
    const response = await supabase
      .from('weeks')
      .select('*')
      .eq('season', round.season)
      .eq('week_number', round.weekNumber)
      .eq('is_custom', round.isCustom)
      .single();
    week = response.data;
    weekError = response.error;
  } catch (error: any) {
    weekError = error;
  }

  if (weekError && weekError.code !== 'PGRST116') {
    if (isMissingWeekColumnError(weekError)) {
      if (round.isCustom) {
        throw new Error('Custom rounds require the add_custom_rounds.sql Supabase migration before they can be used.');
      }

      const legacyResponse = await supabase
        .from('weeks')
        .select('*')
        .eq('saturday_date', round.saturdayDate)
        .single();

      if (legacyResponse.error && legacyResponse.error.code !== 'PGRST116') {
        throw new Error(legacyResponse.error.message);
      }

      if (legacyResponse.data) {
        const normalizedLegacyWeek = normalizeWeek(legacyResponse.data);
        if (!normalizedLegacyWeek) {
          throw new Error('Failed to normalize legacy week');
        }
        return { week: normalizedLegacyWeek, round };
      }

      const { data: newWeek, error: createError } = await supabase
        .from('weeks')
        .upsert({
          week_number: round.weekNumber,
          season: round.season,
          saturday_date: round.saturdayDate,
          status: 'active',
        }, {
          onConflict: 'saturday_date',
          ignoreDuplicates: false,
        })
        .select()
        .single();

      if (createError) {
        throw new Error(createError.message);
      }

      const normalizedLegacyNewWeek = normalizeWeek(newWeek);
      if (!normalizedLegacyNewWeek) {
        throw new Error('Failed to create legacy week');
      }
      return { week: normalizedLegacyNewWeek, round };
    }

    throw new Error(weekError.message);
  }

  if (week) {
    const normalizedWeek = normalizeWeek(week);
    if (!normalizedWeek) {
      throw new Error('Failed to normalize week');
    }
    // For custom rounds, if a week already exists with different params, silently use
    // the existing week rather than surfacing a conflict error to the user.
    const existingKickoff = normalizeKickoffTime(normalizedWeek.target_kickoff_time || '15:00:00');
    if (
      round.isCustom &&
      (normalizedWeek.target_date !== round.targetDate || existingKickoff !== round.kickoffTime)
    ) {
      console.warn(
        `[Fixtures] Custom week ${round.weekNumber}.5 already exists for ${normalizedWeek.target_date} at ${existingKickoff.slice(0, 5)}. Using existing week instead of requested ${round.targetDate} at ${round.kickoffTime.slice(0, 5)}.`
      );
    }
    return { week: normalizedWeek, round };
  }

  const { data: newWeek, error: createError } = await supabase
    .from('weeks')
    .upsert({
      week_number: round.weekNumber,
      season: round.season,
      saturday_date: round.saturdayDate,
      target_date: round.targetDate,
      target_kickoff_time: round.kickoffTime,
      is_custom: round.isCustom,
      status: 'active',
    }, {
      onConflict: 'season,week_number,is_custom',
      ignoreDuplicates: false,
    })
    .select()
    .single();

  if (createError) {
    if (isSaturdayDateUniqueConstraintError(createError)) {
      throw new Error(
        'Custom rounds need the drop_weeks_saturday_date_unique.sql Supabase migration before they can share a Saturday anchor with the main week.'
      );
    }
    throw new Error(createError.message);
  }

  const normalizedNewWeek = normalizeWeek(newWeek);
  if (!normalizedNewWeek) {
    throw new Error('Failed to create week');
  }

  return { week: normalizedNewWeek, round };
}

/**
 * GET /api/fixtures - Get fixtures for the current week.
 * If none exist in DB, fetch from API and store them.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const { week, round } = await getOrCreateWeek(searchParams);

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
    console.log(`No fixtures in DB for ${round.targetDate} ${round.kickoffTime}. Use refresh button to fetch.`);
    return NextResponse.json({ week, fixtures: [], message: 'No fixtures loaded yet. Click refresh to run the hybrid BSD/SofaScore sync.' });
  } catch (err: any) {
    console.error('Fixtures API error:', err);
    const message = String(err?.message || '');
    const status =
      message.includes('drop_weeks_saturday_date_unique.sql')
        ? 409
        : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}

/**
 * POST /api/fixtures/refresh - Force refresh fixtures from the API.
 * Rate limited: only once per hour.
 */
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const { week, round } = await getOrCreateWeek(searchParams);

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

    console.log(`Fetching fixtures from API for ${round.targetDate} ${round.kickoffTime}`);
    const apiFixtures = await fetchFixturesForSlot(round.targetDate, round.kickoffTime);
    console.log(`API returned ${apiFixtures.length} fixtures`);

    const fixtureRows = apiFixtures.map((f) => ({
      api_fixture_id: f.fixture.id,
      data_provider: 'sofascore',
      provider_fixture_id: f.fixture.id,
      bsd_event_id: null,
      week_id: week.id,
      home_team: f.teams.home.name,
      away_team: f.teams.away.name,
      home_team_id: f.teams.home.id,
      away_team_id: f.teams.away.id,
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
      .upsert(fixtureRows, { onConflict: 'data_provider,provider_fixture_id' })
      .select();

    if (error) {
      console.error('DB insert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`Stored ${fixtures?.length || 0} fixtures in DB`);
    return NextResponse.json({ week, fixtures });
  } catch (err: any) {
    console.error('Fixtures refresh error:', err);
    const message = String(err?.message || '');
    const status =
      message.includes('drop_weeks_saturday_date_unique.sql')
        ? 409
        : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}
