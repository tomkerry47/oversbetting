import { NextRequest, NextResponse } from 'next/server';

const API_BASE = 'https://api.sofascore.com/api/v1';

// Our target leagues
const TARGET_LEAGUES = {
  17: 'Premier League',
  18: 'Championship',
  24: 'League One',
  25: 'League Two',
  173: 'National League',
  36: 'Scottish Premiership',
  206: 'Scottish Championship',
  207: 'Scottish League One',
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || '2026-02-07';

    console.log(`Fetching fixtures for ${date}`);

    const url = `${API_BASE}/sport/football/scheduled-events/${date}`;
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `SofaScore API error: ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    const events = data.events || [];

    console.log(`Total events from API: ${events.length}`);

    // Filter for our leagues and 15:00 kick-offs
    const fixtures = events
      .filter((event: any) => {
        const leagueId = event.tournament?.uniqueTournament?.id;
        return TARGET_LEAGUES.hasOwnProperty(leagueId);
      })
      .map((event: any) => {
        const kickOff = new Date(event.startTimestamp * 1000);
        const ukTime = kickOff.toLocaleTimeString('en-GB', {
          timeZone: 'Europe/London',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });

        return {
          id: event.id,
          homeTeam: event.homeTeam?.name || 'Unknown',
          awayTeam: event.awayTeam?.name || 'Unknown',
          kickOff: kickOff.toISOString(),
          kickOffTime: ukTime,
          league: event.tournament?.uniqueTournament?.name || 'Unknown League',
          leagueId: event.tournament?.uniqueTournament?.id || 0,
          tournament: event.tournament?.name || 'Unknown Tournament',
          is3pm: ukTime === '15:00',
        };
      })
      .filter((f: any) => f.is3pm);

    console.log(`Found ${fixtures.length} fixtures at 15:00 from target leagues`);

    // Get league summary
    const leagueCounts = fixtures.reduce((acc: Record<string, number>, f: any) => {
      const key = `${f.league} (ID: ${f.leagueId})`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    console.log('Leagues:', leagueCounts);

    return NextResponse.json({
      fixtures,
      total: fixtures.length,
      leagues: leagueCounts,
    });
  } catch (err: any) {
    console.error('Test fixtures error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
