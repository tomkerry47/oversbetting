const API_BASES = [
  'https://api.sofascore.com/api/v1',
  'https://www.sofascore.com/api/v1',
  'https://api.sofavpn.com/api/v1',
  'https://www.sofavpn.com/api/v1',
];

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

declare const Deno: {
  serve: (handler: (request: Request) => Response | Promise<Response>) => void;
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

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const date = url.searchParams.get('date') || getUkToday();
  const endpoint = `/sport/football/scheduled-events/${date}`;
  const attempts = [];

  for (const baseUrl of API_BASES) {
    try {
      const response = await fetch(`${baseUrl}${endpoint}`, {
        headers: {
          Accept: '*/*',
          'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
          'Cache-Control': 'no-cache',
          Origin: 'https://www.sofascore.com',
          Pragma: 'no-cache',
          Referer: 'https://www.sofascore.com/',
          'User-Agent': USER_AGENT,
        },
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

      return Response.json(
        {
          ok: true,
          source: 'supabase-edge-function',
          date,
          endpoint,
          successfulHost: baseUrl,
          attemptedHosts: API_BASES,
          attempts,
          totalEvents: events.length,
          fixtures: summarizeEvents(events),
          raw: data,
        },
        { headers: CORS_HEADERS },
      );
    } catch (error) {
      attempts.push({
        host: baseUrl,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return Response.json(
    {
      ok: false,
      source: 'supabase-edge-function',
      date,
      endpoint,
      attemptedHosts: API_BASES,
      attempts,
      error: `All SofaScore debug hosts failed for ${endpoint}`,
    },
    { status: 502, headers: CORS_HEADERS },
  );
});
