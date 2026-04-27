const RAPIDAPI_HOST = 'sofascore.p.rapidapi.com';
const RAPIDAPI_BASE = `https://${RAPIDAPI_HOST}`;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type RapidApiAttempt = {
  host: string;
  endpoint: string;
  status?: number;
  ok: boolean;
  error?: string;
  snippet?: string;
};

type SofaScoreEvent = {
  id?: number;
  startTimestamp?: number;
  homeTeam?: { name?: string };
  awayTeam?: { name?: string };
  tournament?: {
    uniqueTournament?: { name?: string; id?: number };
    name?: string;
  };
  status?: { type?: string };
};

type SofaScoreSeason = {
  id: number;
  year?: string;
  name?: string;
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

function summarizeEvents(events: SofaScoreEvent[]) {
  return events.map((event) => {
    const kickOff = event?.startTimestamp
      ? new Date(event.startTimestamp * 1000)
      : null;
    const ukTime = kickOff
      ? kickOff.toLocaleTimeString('en-GB', {
          timeZone: 'Europe/London',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
      : null;

    return {
      id: event?.id,
      homeTeam: event?.homeTeam?.name || 'Unknown',
      awayTeam: event?.awayTeam?.name || 'Unknown',
      league: event?.tournament?.uniqueTournament?.name || event?.tournament?.name || 'Unknown',
      kickOff: kickOff?.toISOString() || null,
      ukTime,
      status: event?.status?.type || null,
    };
  });
}

async function rapidApiFetch(endpoint: string, apiKey: string): Promise<{ ok: boolean; status: number; text: string }> {
  const url = `${RAPIDAPI_BASE}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      'x-rapidapi-host': RAPIDAPI_HOST,
      'x-rapidapi-key': apiKey,
    },
    cache: 'no-store',
  });
  const text = await response.text();
  return { ok: response.ok, status: response.status, text };
}

export async function fetchRapidApiDebugFixtures(date?: string, tournamentId?: number) {
  const apiKey = process.env.RAPIDAPI_KEY;

  // Validate the date so user input cannot alter the request path.
  const targetDate =
    date && DATE_RE.test(date) ? date : getUkToday();

  // Default to Premier League (17) if no tournamentId supplied.
  const targetTournamentId = Number.isInteger(tournamentId) && (tournamentId as number) > 0
    ? (tournamentId as number)
    : 17;

  const attempts: RapidApiAttempt[] = [];

  if (!apiKey) {
    return {
      ok: false,
      source: 'rapidapi',
      date: targetDate,
      tournamentId: targetTournamentId,
      successfulHost: null,
      attempts,
      error: 'RAPIDAPI_KEY environment variable is not set',
    };
  }

  // Step 1 – resolve the current season for the tournament.
  const seasonsEndpoint = `/tournaments/seasons?tournamentId=${targetTournamentId}`;
  let seasonId: number;

  try {
    const seasonsResult = await rapidApiFetch(seasonsEndpoint, apiKey);
    attempts.push({
      host: RAPIDAPI_BASE,
      endpoint: seasonsEndpoint,
      status: seasonsResult.status,
      ok: seasonsResult.ok,
      snippet: seasonsResult.text.slice(0, 300),
    });

    if (!seasonsResult.ok) {
      return {
        ok: false,
        source: 'rapidapi',
        date: targetDate,
        tournamentId: targetTournamentId,
        successfulHost: null,
        attempts,
        error: `RapidAPI seasons call responded with status ${seasonsResult.status}: ${seasonsResult.text.slice(0, 200)}`,
      };
    }

    const seasonsData = JSON.parse(seasonsResult.text) as { seasons?: SofaScoreSeason[] };
    const seasons = Array.isArray(seasonsData.seasons) ? seasonsData.seasons : [];

    if (seasons.length === 0) {
      return {
        ok: false,
        source: 'rapidapi',
        date: targetDate,
        tournamentId: targetTournamentId,
        successfulHost: null,
        attempts,
        error: `No seasons returned for tournamentId ${targetTournamentId}`,
      };
    }

    // Seasons are returned newest-first; the first entry is the current season.
    seasonId = seasons[0].id;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    attempts.push({ host: RAPIDAPI_BASE, endpoint: seasonsEndpoint, ok: false, error: message });
    return {
      ok: false,
      source: 'rapidapi',
      date: targetDate,
      tournamentId: targetTournamentId,
      successfulHost: null,
      attempts,
      error: `RapidAPI seasons request failed: ${message}`,
    };
  }

  // Step 2 – fetch events for the tournament/season (page 0 = current/next round).
  const eventsEndpoint = `/tournaments/events?tournamentId=${targetTournamentId}&seasonId=${seasonId}&page=0`;

  try {
    const eventsResult = await rapidApiFetch(eventsEndpoint, apiKey);
    attempts.push({
      host: RAPIDAPI_BASE,
      endpoint: eventsEndpoint,
      status: eventsResult.status,
      ok: eventsResult.ok,
      snippet: eventsResult.text.slice(0, 300),
    });

    if (!eventsResult.ok) {
      return {
        ok: false,
        source: 'rapidapi',
        date: targetDate,
        tournamentId: targetTournamentId,
        seasonId,
        successfulHost: null,
        attempts,
        error: `RapidAPI events call responded with status ${eventsResult.status}: ${eventsResult.text.slice(0, 200)}`,
      };
    }

    const eventsData = JSON.parse(eventsResult.text) as { events?: SofaScoreEvent[] };
    const allEvents = Array.isArray(eventsData.events) ? eventsData.events : [];

    // Optionally filter to the requested date.
    const filteredEvents = allEvents.filter((event) => {
      if (!event.startTimestamp) return true;
      const eventDate = new Date(event.startTimestamp * 1000)
        .toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
      return eventDate === targetDate;
    });

    return {
      ok: true,
      source: 'rapidapi',
      date: targetDate,
      tournamentId: targetTournamentId,
      seasonId,
      eventsEndpoint,
      successfulHost: RAPIDAPI_BASE,
      attempts,
      totalEvents: allEvents.length,
      filteredEvents: filteredEvents.length,
      fixtures: summarizeEvents(filteredEvents),
      raw: eventsData,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    attempts.push({ host: RAPIDAPI_BASE, endpoint: eventsEndpoint, ok: false, error: message });

    return {
      ok: false,
      source: 'rapidapi',
      date: targetDate,
      tournamentId: targetTournamentId,
      seasonId,
      successfulHost: null,
      attempts,
      error: `RapidAPI events request failed: ${message}`,
    };
  }
}
