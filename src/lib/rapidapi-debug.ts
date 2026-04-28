const APIFOOTBALL_BASE = 'https://v3.football.api-sports.io';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type ApiFootballAttempt = {
  host: string;
  endpoint: string;
  status?: number;
  ok: boolean;
  error?: string;
  snippet?: string;
};

type ApiFootballFixture = {
  fixture?: {
    id?: number;
    date?: string;
    status?: { short?: string; long?: string };
  };
  league?: { id?: number; name?: string };
  teams?: {
    home?: { id?: number; name?: string };
    away?: { id?: number; name?: string };
  };
};

function getUkToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function summarizeFixtures(fixtures: ApiFootballFixture[]) {
  return fixtures.map((item) => {
    const kickOff = item?.fixture?.date ? new Date(item.fixture.date) : null;
    const ukTime = kickOff
      ? kickOff.toLocaleTimeString('en-GB', {
          timeZone: 'Europe/London',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
      : null;

    return {
      id: item?.fixture?.id,
      homeTeam: item?.teams?.home?.name || 'Unknown',
      awayTeam: item?.teams?.away?.name || 'Unknown',
      league: item?.league?.name || 'Unknown',
      kickOff: kickOff?.toISOString() || null,
      ukTime,
      status: item?.fixture?.status?.short || null,
    };
  });
}

async function apiFootballFetch(endpoint: string, apiKey: string): Promise<{ ok: boolean; status: number; text: string }> {
  const url = `${APIFOOTBALL_BASE}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      'x-apisports-key': apiKey,
    },
    cache: 'no-store',
  });
  const text = await response.text();
  return { ok: response.ok, status: response.status, text };
}

export async function fetchRapidApiDebugFixtures(date?: string, leagueId?: number) {
  const apiKey = process.env.APIFOOTBALLKEY;

  // Validate the date so user input cannot alter the request path.
  const targetDate =
    date && DATE_RE.test(date) ? date : getUkToday();

  // Default to Premier League (39) if no leagueId supplied.
  const targetLeagueId = Number.isInteger(leagueId) && (leagueId as number) > 0
    ? (leagueId as number)
    : 39;

  const attempts: ApiFootballAttempt[] = [];

  if (!apiKey) {
    return {
      ok: false,
      source: 'api-football',
      date: targetDate,
      leagueId: targetLeagueId,
      successfulHost: null,
      attempts,
      error: 'APIFOOTBALLKEY environment variable is not set',
    };
  }

  const fixturesEndpoint = `/fixtures?date=${targetDate}&league=${targetLeagueId}&season=${getSeasonYear(targetDate)}`;

  try {
    const result = await apiFootballFetch(fixturesEndpoint, apiKey);
    attempts.push({
      host: APIFOOTBALL_BASE,
      endpoint: fixturesEndpoint,
      status: result.status,
      ok: result.ok,
      snippet: result.text.slice(0, 300),
    });

    if (!result.ok) {
      return {
        ok: false,
        source: 'api-football',
        date: targetDate,
        leagueId: targetLeagueId,
        successfulHost: null,
        attempts,
        error: `api-football call responded with status ${result.status}: ${result.text.slice(0, 200)}`,
      };
    }

    const data = JSON.parse(result.text) as { response?: ApiFootballFixture[]; errors?: unknown };
    const allFixtures = Array.isArray(data.response) ? data.response : [];

    return {
      ok: true,
      source: 'api-football',
      date: targetDate,
      leagueId: targetLeagueId,
      fixturesEndpoint,
      successfulHost: APIFOOTBALL_BASE,
      attempts,
      totalEvents: allFixtures.length,
      filteredEvents: allFixtures.length,
      fixtures: summarizeFixtures(allFixtures),
      raw: data,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    attempts.push({ host: APIFOOTBALL_BASE, endpoint: fixturesEndpoint, ok: false, error: message });

    return {
      ok: false,
      source: 'api-football',
      date: targetDate,
      leagueId: targetLeagueId,
      successfulHost: null,
      attempts,
      error: `api-football request failed: ${message}`,
    };
  }
}

function getSeasonYear(date: string): number {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  return month >= 8 ? year : year - 1;
}
