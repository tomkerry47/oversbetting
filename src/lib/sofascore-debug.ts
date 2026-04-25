const API_BASES = [
  'https://api.sofascore.com/api/v1',
  'https://www.sofascore.com/api/v1',
  'https://api.sofavpn.com/api/v1',
  'https://www.sofavpn.com/api/v1',
];

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

type SofaScoreAttempt = {
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
      leagueId: event?.tournament?.uniqueTournament?.id || null,
      kickOff: kickOff?.toISOString() || null,
      ukTime,
      status: event?.status?.type || null,
    };
  });
}

export async function fetchSofaScoreDebugFixtures(date?: string) {
  const targetDate = date || getUkToday();
  const endpoint = `/sport/football/scheduled-events/${targetDate}`;
  const attempts: SofaScoreAttempt[] = [];

  for (const baseUrl of API_BASES) {
    const url = `${baseUrl}${endpoint}`;

    try {
      const response = await fetch(url, {
        headers: {
          Accept: '*/*',
          'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
          'Cache-Control': 'no-cache',
          Origin: 'https://www.sofascore.com',
          Pragma: 'no-cache',
          Referer: 'https://www.sofascore.com/',
          'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"macOS"',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-site',
          'User-Agent': USER_AGENT,
        },
        cache: 'no-store',
      });

      const text = await response.text();
      attempts.push({
        host: baseUrl,
        status: response.status,
        ok: response.ok,
        snippet: text.slice(0, 300),
      });

      if (!response.ok) {
        continue;
      }

      const data = JSON.parse(text);
      const events = Array.isArray(data.events) ? data.events : [];

      return {
        ok: true,
        source: 'vercel',
        date: targetDate,
        endpoint,
        successfulHost: baseUrl,
        attemptedHosts: API_BASES,
        attempts,
        totalEvents: events.length,
        fixtures: summarizeEvents(events),
        raw: data,
      };
    } catch (error: any) {
      attempts.push({
        host: baseUrl,
        ok: false,
        error: error?.message || String(error),
      });
    }
  }

  return {
    ok: false,
    source: 'vercel',
    date: targetDate,
    endpoint,
    attemptedHosts: API_BASES,
    attempts,
    error: `All SofaScore debug hosts failed for ${endpoint}`,
  };
}
