import { LEAGUE_IDS, APIFixture } from '@/types';

const API_BASE = 'https://v3.football.api-sports.io';
const API_KEY = process.env.FOOTBALL_API_KEY!;

async function apiRequest(endpoint: string, params: Record<string, string>) {
  const url = new URL(`${API_BASE}${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  console.log(`API request: ${url.toString()}`);

  const res = await fetch(url.toString(), {
    headers: {
      'x-apisports-key': API_KEY,
    },
    next: { revalidate: 300 }, // cache for 5 min
  });

  if (!res.ok) {
    const errorBody = await res.text();
    console.error(`Football API error: ${res.status} ${res.statusText}`, errorBody);
    throw new Error(`Football API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  console.log(`API response:`, { 
    endpoint, 
    params, 
    responseCount: data.response?.length || 0,
    errors: data.errors 
  });
  
  return data;
}

/**
 * Fetch Saturday 15:00 BST/GMT kick-offs for all tracked leagues on a given date.
 */
export async function fetchSaturdayFixtures(date: string): Promise<APIFixture[]> {
  const leagueIds = Object.keys(LEAGUE_IDS);
  const allFixtures: APIFixture[] = [];

  // Fetch fixtures for each league (API allows one league per request)
  const requests = leagueIds.map(async (leagueId) => {
    try {
      const data = await apiRequest('/fixtures', {
        league: leagueId,
        date: date,
        timezone: 'Europe/London',
      });
      return (data.response || []) as APIFixture[];
    } catch (err) {
      console.error(`Error fetching league ${leagueId}:`, err);
      return [] as APIFixture[];
    }
  });

  const results = await Promise.all(requests);

  console.log(`Processing ${results.flat().length} total fixtures from API`);

  for (const fixtures of results) {
    // Filter for 15:00 kick-offs (UK time)
    const filtered = fixtures.filter((f: APIFixture) => {
      const kickOff = new Date(f.fixture.date);
      // Convert to UK time string and check hour
      const ukTime = kickOff.toLocaleTimeString('en-GB', {
        timeZone: 'Europe/London',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      const is3pm = ukTime === '15:00';
      
      if (fixtures.length > 0 && !is3pm) {
        console.log(`Skipping ${f.teams.home.name} vs ${f.teams.away.name} - kick-off: ${ukTime}`);
      }
      
      return is3pm;
    });
    
    if (filtered.length > 0) {
      console.log(`Found ${filtered.length} 15:00 kick-offs from this league`);
    }
    
    allFixtures.push(...filtered);
  }

  console.log(`Total 15:00 fixtures for ${date}: ${allFixtures.length}`);
  return allFixtures;
}

/**
 * Fetch live/completed results for specific fixture IDs.
 */
export async function fetchFixtureResults(fixtureIds: number[]): Promise<APIFixture[]> {
  if (fixtureIds.length === 0) return [];

  const idsParam = fixtureIds.join('-');
  const data = await apiRequest('/fixtures', {
    ids: idsParam,
  });

  return (data.response || []) as APIFixture[];
}

/**
 * Get the current season year string.
 */
export function getCurrentSeason(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  // Football season starts in August
  if (month >= 8) {
    return `${year}-${(year + 1).toString().slice(-2)}`;
  }
  return `${year - 1}-${year.toString().slice(-2)}`;
}
