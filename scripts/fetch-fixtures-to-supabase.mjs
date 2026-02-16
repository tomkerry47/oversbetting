import { createClient } from '@supabase/supabase-js';

const API_BASE = 'https://api.sofascore.com/api/v1';

const SOFASCORE_TOURNAMENTS = {
  19: 'FA Cup',
  347: 'Scottish Cup',
  17: 'Premier League',
  18: 'Championship',
  24: 'League One',
  25: 'League Two',
  173: 'National League',
  36: 'Scottish Premiership',
  206: 'Scottish Championship',
  207: 'Scottish League One',
  209: 'Scottish League Two',
};

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function parseWeekOffset(argv) {
  const fromFlag = argv.find((arg) => arg.startsWith('--weekOffset='));
  if (!fromFlag) return 1;
  const value = Number(fromFlag.split('=')[1]);
  if (!Number.isFinite(value)) return 1;
  return Math.max(0, Math.floor(value));
}

function getUkDate() {
  const now = new Date();
  const london = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/London' }));
  return london;
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getRelevantSaturday(weekOffset = 0) {
  const now = getUkDate();
  const day = now.getDay();
  const saturday = new Date(now);

  if (day === 6) {
    // Saturday
  } else if (day === 0) {
    saturday.setDate(now.getDate() + 6);
  } else {
    saturday.setDate(now.getDate() + (6 - day));
  }

  saturday.setDate(saturday.getDate() + weekOffset * 7);
  return formatDate(saturday);
}

function getCurrentSeason() {
  const now = getUkDate();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  if (month >= 8) {
    return `${year}-${String(year + 1).slice(-2)}`;
  }
  return `${year - 1}-${String(year).slice(-2)}`;
}

function calculateWeekNumber(saturdayDate, seasonStart = '2025-08-01') {
  const saturday = new Date(saturdayDate);
  const start = new Date(seasonStart);
  const diffMs = saturday.getTime() - start.getTime();
  const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
  return Math.max(1, diffWeeks + 1);
}

async function fetchScheduledEvents(date) {
  const url = `${API_BASE}/sport/football/scheduled-events/${date}`;
  const res = await fetch(url, {
    headers: {
      Accept: '*/*',
      'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
      Origin: 'https://www.sofascore.com',
      Referer: 'https://www.sofascore.com/',
      'User-Agent': USER_AGENT,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SofaScore error ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

function filterAndMapFixtures(events) {
  const allowedIds = new Set(Object.keys(SOFASCORE_TOURNAMENTS).map(Number));
  const rows = [];

  for (const event of events || []) {
    const leagueId = event?.tournament?.uniqueTournament?.id;
    if (!allowedIds.has(leagueId)) continue;
    if (event?.status?.type === 'postponed') continue;

    const kickOff = new Date(event.startTimestamp * 1000);
    const ukTime = kickOff.toLocaleTimeString('en-GB', {
      timeZone: 'Europe/London',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    if (ukTime !== '15:00') continue;

    rows.push({
      api_fixture_id: event.id,
      home_team: event.homeTeam?.name || '',
      away_team: event.awayTeam?.name || '',
      home_team_id: event.homeTeam?.id || null,
      away_team_id: event.awayTeam?.id || null,
      home_team_logo: `https://api.sofascore.com/api/v1/team/${event.homeTeam?.id}/image`,
      away_team_logo: `https://api.sofascore.com/api/v1/team/${event.awayTeam?.id}/image`,
      league_id: leagueId,
      league_name:
        SOFASCORE_TOURNAMENTS[leagueId] ||
        event?.tournament?.uniqueTournament?.name ||
        'Unknown',
      kick_off: kickOff.toISOString(),
      home_score: event?.homeScore?.current ?? null,
      away_score: event?.awayScore?.current ?? null,
      match_status:
        event?.status?.type === 'finished'
          ? 'FT'
          : event?.status?.type === 'inprogress'
          ? 'LIVE'
          : 'NS',
    });
  }

  return rows;
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY).');
  }

  const weekOffset = parseWeekOffset(process.argv.slice(2));
  const saturdayDate = getRelevantSaturday(weekOffset);
  const season = getCurrentSeason();
  const weekNumber = calculateWeekNumber(saturdayDate);

  console.log(`Fetching fixtures for saturday=${saturdayDate}, weekOffset=${weekOffset}`);

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });

  const { data: week, error: weekErr } = await supabase
    .from('weeks')
    .upsert(
      {
        week_number: weekNumber,
        season,
        saturday_date: saturdayDate,
        status: 'active',
      },
      { onConflict: 'saturday_date' }
    )
    .select()
    .single();

  if (weekErr || !week) {
    throw new Error(`Failed to upsert week: ${weekErr?.message || 'unknown error'}`);
  }

  const data = await fetchScheduledEvents(saturdayDate);
  const fixtureRows = filterAndMapFixtures(data.events || []).map((row) => ({
    ...row,
    week_id: week.id,
  }));

  if (fixtureRows.length === 0) {
    console.log('No matching 15:00 fixtures found for configured leagues.');
    return;
  }

  const { error: fixtureErr } = await supabase
    .from('fixtures')
    .upsert(fixtureRows, { onConflict: 'api_fixture_id' });

  if (fixtureErr) {
    throw new Error(`Failed to upsert fixtures: ${fixtureErr.message}`);
  }

  console.log(`Stored/updated ${fixtureRows.length} fixtures for week ${week.week_number}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
