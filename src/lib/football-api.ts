import { APIFixture } from '@/types';

// Using SofaScore unofficial API (free, no key needed)
const API_BASE = 'https://api.sofascore.com/api/v1';

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

async function apiRequest(endpoint: string) {
  const url = `${API_BASE}${endpoint}`;
  console.log(`SofaScore API request: ${url}`);

  const res = await fetch(url, {
    headers: {
      'Accept': 'application/json',
    },
    cache: 'no-store', // Disable caching - responses are too large (3MB+)
  });

  if (!res.ok) {
    const errorBody = await res.text();
    console.error(`SofaScore API error: ${res.status} ${res.statusText}`, errorBody);
    throw new Error(`SofaScore API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  console.log(`SofaScore API response:`, { 
    endpoint,
    eventCount: data.events?.length || 0
  });
  
  return data;
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
  
  // Fetch each event individually
  for (const fixtureId of fixtureIds) {
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
