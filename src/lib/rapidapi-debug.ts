const RAPIDAPI_HOST = 'sofascore6.p.rapidapi.com';
const RAPIDAPI_BASE = `https://${RAPIDAPI_HOST}/api/sofascore/v1`;

type RapidApiAttempt = {
  host: string;
  status?: number;
  ok: boolean;
  error?: string;
  snippet?: string;
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

function summarizeEvents(events: any[]) {
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

export async function fetchRapidApiDebugFixtures(date?: string) {
  const apiKey = process.env.RAPIDAPI_KEY;
  const targetDate = date || getUkToday();
  const endpoint = `/sport/football/scheduled-events/${targetDate}`;
  const url = `${RAPIDAPI_BASE}${endpoint}`;
  const attempts: RapidApiAttempt[] = [];

  if (!apiKey) {
    return {
      ok: false,
      source: 'rapidapi',
      date: targetDate,
      endpoint,
      successfulHost: null,
      attempts,
      error: 'RAPIDAPI_KEY environment variable is not set',
    };
  }

  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'x-rapidapi-host': RAPIDAPI_HOST,
        'x-rapidapi-key': apiKey,
      },
      cache: 'no-store',
    });

    const text = await response.text();
    attempts.push({
      host: RAPIDAPI_BASE,
      status: response.status,
      ok: response.ok,
      snippet: text.slice(0, 300),
    });

    if (!response.ok) {
      return {
        ok: false,
        source: 'rapidapi',
        date: targetDate,
        endpoint,
        successfulHost: null,
        attempts,
        error: `RapidAPI responded with status ${response.status}: ${text.slice(0, 200)}`,
      };
    }

    const data = JSON.parse(text);
    const events = Array.isArray(data.events) ? data.events : [];

    return {
      ok: true,
      source: 'rapidapi',
      date: targetDate,
      endpoint,
      successfulHost: RAPIDAPI_BASE,
      attempts,
      totalEvents: events.length,
      fixtures: summarizeEvents(events),
      raw: data,
    };
  } catch (error: any) {
    attempts.push({
      host: RAPIDAPI_BASE,
      ok: false,
      error: error?.message || String(error),
    });

    return {
      ok: false,
      source: 'rapidapi',
      date: targetDate,
      endpoint,
      successfulHost: null,
      attempts,
      error: `RapidAPI request failed: ${error?.message || String(error)}`,
    };
  }
}
