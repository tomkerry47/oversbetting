import { APIFixture } from '@/types';
import { browserApiRequest } from './browser-api';

// Using SofaScore unofficial API (free, no key needed)
const API_BASE = 'https://api.sofascore.com/api/v1';

// Flag to enable browser-based requests (slower but bypasses 403)
const USE_BROWSER = process.env.USE_BROWSER_API === 'true';

// SofaScore tournament IDs for our leagues
const SOFASCORE_TOURNAMENTS: Record<string, { id: number; name: string }> = {
  // Cups (priority)
  '19': { id: 19, name: 'FA Cup' },
  '347': { id: 347, name: 'Scottish Cup' },
  // England
  '17': { id: 17, name: 'Premier League' },
  '18': { id: 18, name: 'Championship' },
  '24': { id: 24, name: 'League One' },
  '25': { id: 25, name: 'League Two' },
  '173': { id: 173, name: 'National League' },
  // Scotland
  '36': { id: 36, name: 'Scottish Premiership' },
  '206': { id: 206, name: 'Scottish Championship' },
  '207': { id: 207, name: 'Scottish League One' },
  '209': { id: 209, name: 'Scottish League Two' },
};

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function apiRequest(endpoint: string, retries = 3) {
  const url = `${API_BASE}${endpoint}`;
  console.log(`SofaScore API request: ${url} (browser: ${USE_BROWSER})`);

  // If browser mode is enabled, use Chromium-based requests
  if (USE_BROWSER) {
    try {
      return await browserApiRequest(url, retries);
    } catch (error) {
      console.error('Browser request failed, falling back to fetch:', error);
      // Fall through to regular fetch as fallback
    }
  }

  for (let i = 0; i < retries; i++) {
    try {
      // Add small random delay before each request to avoid rate limiting
      if (i > 0) {
        const jitter = Math.random() * 500; // 0-500ms random jitter
        const delay = Math.pow(2, i) * 1000 + jitter; // Exponential backoff with jitter
        console.log(`Retrying in ${Math.round(delay)}ms... (attempt ${i + 1}/${retries})`);
        await sleep(delay);
      }

      const res = await fetch(url, {
        headers: {
          'Accept': '*/*',
          'Accept-Encoding': 'gzip, deflate, br',
          'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'DNT': '1',
          'Host': 'api.sofascore.com',
          'Origin': 'https://www.sofascore.com',
          'Pragma': 'no-cache',
          'Referer': 'https://www.sofascore.com/',
          'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"macOS"',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-site',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        next: { revalidate: 0 }, // Next.js specific: don't cache
      });

      if (!res.ok) {
        const errorBody = await res.text();
        console.error(`SofaScore API error: ${res.status} ${res.statusText}`, errorBody);
        
        // If 403 challenge and we have retries left, wait longer and try again
        if (res.status === 403 && i < retries - 1) {
          continue; // Retry loop will handle backoff
        }
        
        throw new Error(`SofaScore API error: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      console.log(`SofaScore API response:`, { 
        endpoint,
        eventCount: data.events?.length || 0
      });
      
      return data;
    } catch (error) {
      // If network error and we have retries left, try again
      if (i < retries - 1) {
        continue; // Retry loop will handle backoff
      }
      throw error;
    }
  }
  
  throw new Error('Max retries exceeded');
}

/**
 * Fetch Saturday 15:00 BST/GMT kick-offs for all tracked leagues on a given date.
 */
export async function fetchSaturdayFixtures(date: string): Promise<APIFixture[]> {
  const allFixtures: APIFixture[] = [];
  
  console.log(`Fetching fixtures for ${date}`);

  try {
    // Fetch all fixtures for the date (single API call)
    const data = await apiRequest(`/sport/football/scheduled-events/${date}`);
    const events = data.events || [];
    
    console.log(`Total events from API: ${events.length}`);

    // Filter for our target leagues
    const targetLeagueIds = Object.keys(SOFASCORE_TOURNAMENTS).map(Number);
    
    for (const event of events) {
      const leagueId = event.tournament?.uniqueTournament?.id;
      
      // Check if this is one of our target leagues
      if (!targetLeagueIds.includes(leagueId)) {
        continue;
      }

      // Skip postponed matches
      if (event.status?.type === 'postponed') {
        console.log(`Skipping postponed match: ${event.homeTeam?.name} vs ${event.awayTeam?.name}`);
        continue;
      }

      const kickOff = new Date(event.startTimestamp * 1000);
      const ukTime = kickOff.toLocaleTimeString('en-GB', {
        timeZone: 'Europe/London',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });

      // Only include 15:00 kick-offs
      if (ukTime !== '15:00') {
        continue;
      }

      const leagueName = SOFASCORE_TOURNAMENTS[String(leagueId)]?.name || event.tournament?.uniqueTournament?.name || 'Unknown';

      allFixtures.push({
        fixture: {
          id: event.id,
          date: kickOff.toISOString(),
          status: {
            short: event.status?.type === 'finished' ? 'FT' : 
                   event.status?.type === 'inprogress' ? 'LIVE' : 'NS',
            long: event.status?.type === 'finished' ? 'Match Finished' : 
                  event.status?.type === 'inprogress' ? 'In Progress' : 'Not Started',
          },
        },
        league: {
          id: leagueId,
          name: leagueName,
        },
        teams: {
          home: {
            id: event.homeTeam?.id || 0,
            name: event.homeTeam?.name || '',
            logo: `https://api.sofascore.com/api/v1/team/${event.homeTeam?.id}/image`,
          },
          away: {
            id: event.awayTeam?.id || 0,
            name: event.awayTeam?.name || '',
            logo: `https://api.sofascore.com/api/v1/team/${event.awayTeam?.id}/image`,
          },
        },
        goals: {
          home: event.homeScore?.current ?? null,
          away: event.awayScore?.current ?? null,
        },
      });
    }

    console.log(`Total 15:00 fixtures for ${date}: ${allFixtures.length}`);
    
    // Log league breakdown
    const leagueCounts = allFixtures.reduce((acc, f) => {
      acc[f.league.name] = (acc[f.league.name] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    console.log('League breakdown:', leagueCounts);

    return allFixtures;
  } catch (err) {
    console.error('Error fetching Saturday fixtures:', err);
    return [];
  }
}

/**
 * Fetch live/completed results for specific fixture IDs.
 */
export async function fetchFixtureResults(fixtureIds: number[]): Promise<APIFixture[]> {
  if (fixtureIds.length === 0) return [];
  
  console.log(`[fetchFixtureResults] Fetching results for ${fixtureIds.length} fixtures`);
  
  const allFixtures: APIFixture[] = [];
  
  // Fetch each event individually with delays to avoid rate limiting
  for (let i = 0; i < fixtureIds.length; i++) {
    const fixtureId = fixtureIds[i];
    
    // Add delay between requests (except first one) to avoid triggering anti-bot
    if (i > 0) {
      const delay = 500 + Math.random() * 500; // 500-1000ms random delay
      console.log(`[fetchFixtureResults] Waiting ${Math.round(delay)}ms before next request...`);
      await sleep(delay);
    }
    
    try {
      console.log(`[fetchFixtureResults] Fetching event ${fixtureId}`);
      const data = await apiRequest(`/event/${fixtureId}`);
      const event = data.event;
      
      if (event) {
        const tournament = event.tournament?.uniqueTournament;
        const leagueName = SOFASCORE_TOURNAMENTS[String(tournament?.id)]?.name || tournament?.name || 'Unknown';
        
        console.log(`[fetchFixtureResults] Event ${fixtureId}: ${event.homeTeam?.name} ${event.homeScore?.current ?? 'N/A'} - ${event.awayScore?.current ?? 'N/A'} ${event.awayTeam?.name} (${event.status?.type})`);
        
        allFixtures.push({
          fixture: {
            id: event.id,
            date: new Date(event.startTimestamp * 1000).toISOString(),
            status: {
              short: event.status?.type === 'finished' ? 'FT' : 
                     event.status?.type === 'inprogress' ? 'LIVE' : 'NS',
              long: event.status?.type === 'finished' ? 'Match Finished' : 
                    event.status?.type === 'inprogress' ? 'In Progress' : 'Not Started',
            },
          },
          league: {
            id: tournament?.id || 0,
            name: leagueName,
          },
          teams: {
            home: {
              id: event.homeTeam?.id || 0,
              name: event.homeTeam?.name || '',
              logo: `https://api.sofascore.com/api/v1/team/${event.homeTeam?.id}/image`,
            },
            away: {
              id: event.awayTeam?.id || 0,
              name: event.awayTeam?.name || '',
              logo: `https://api.sofascore.com/api/v1/team/${event.awayTeam?.id}/image`,
            },
          },
          goals: {
            home: event.homeScore?.current ?? null,
            away: event.awayScore?.current ?? null,
          },
        });
      }
    } catch (err) {
      console.error(`Error fetching fixture ${fixtureId}:`, err);
    }
  }
  
  console.log(`[fetchFixtureResults] Successfully fetched ${allFixtures.length} results`);
  return allFixtures;
}

/**
 * Get the current season year string.
/**
 * Get the current season year string.
 */
export function getCurrentSeason(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  // Football season starts in August
  if (month >= 8) {
    return `${year}-${String(year + 1).slice(-2)}`;
  }
  return `${year - 1}-${String(year).slice(-2)}`;
}

/**
 * Fetch team form (last 5 matches)
 */
export async function fetchTeamForm(teamId: number): Promise<any[]> {
  try {
    const data = await apiRequest(`/team/${teamId}/events/last/0`);
    return (data.events || []).slice(0, 5);
  } catch (error) {
    console.error(`Error fetching form for team ${teamId}:`, error);
    return [];
  }
}

/**
 * Fetch betting odds for a fixture
 */
export async function fetchFixtureOdds(fixtureId: number): Promise<any> {
  try {
    const data = await apiRequest(`/event/${fixtureId}/odds/1/all`);
    return data;
  } catch (error) {
    console.error(`Error fetching odds for fixture ${fixtureId}:`, error);
    return null;
  }
}
