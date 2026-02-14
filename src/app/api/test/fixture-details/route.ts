import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const API_BASE = 'https://api.sofascore.com/api/v1';

async function apiRequest(endpoint: string) {
  const url = `${API_BASE}${endpoint}`;
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
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }

  return res.json();
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fixtureId = searchParams.get('fixtureId');
    const homeTeamId = searchParams.get('homeTeamId');
    const awayTeamId = searchParams.get('awayTeamId');
    const leagueId = searchParams.get('leagueId');

    if (!fixtureId || !homeTeamId || !awayTeamId) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Fetch all data in parallel, including the fixture details to get its date
    const [fixtureData, homeFormData, awayFormData, oddsData] = await Promise.allSettled([
      apiRequest(`/event/${fixtureId}`),
      apiRequest(`/team/${homeTeamId}/events/last/0`),
      apiRequest(`/team/${awayTeamId}/events/last/0`),
      apiRequest(`/event/${fixtureId}/odds/1/all`),
    ]);

    // Get the fixture date to filter form matches before this date
    const fixtureTimestamp = fixtureData.status === 'fulfilled' 
      ? fixtureData.value.event?.startTimestamp 
      : Date.now() / 1000;
    
    const fixtureDate = new Date(fixtureTimestamp * 1000);
    const cutoffDate = new Date(fixtureTimestamp * 1000);
    cutoffDate.setDate(cutoffDate.getDate() - 180); // Look back 180 days from fixture date
    
    console.log(`[Form Debug] Fixture Date: ${fixtureDate.toISOString()}, Cutoff: ${cutoffDate.toISOString()}`);

    // Process home team form - last 5 finished matches in same competition
    const homeForm = homeFormData.status === 'fulfilled' 
      ? (() => {
          const allEvents = homeFormData.value.events || [];
          console.log(`[Home Team ${homeTeamId}] Total events returned: ${allEvents.length}`);
          console.log(`[Home Team ${homeTeamId}] First 10 events:`, allEvents.slice(0, 10).map((e: any) => ({
            id: e.id,
            date: new Date(e.startTimestamp * 1000).toISOString(),
            status: e.status?.type,
            tournament: e.tournament?.uniqueTournament?.name,
            tournamentId: e.tournament?.uniqueTournament?.id,
          })));
          
          const filtered = allEvents.filter((e: any) => {
            const matchDate = new Date(e.startTimestamp * 1000);
            const sameLeague = !leagueId || e.tournament?.uniqueTournament?.id === parseInt(leagueId);
            const isFinished = e.status?.type === 'finished';
            const isBeforeFixture = e.startTimestamp < fixtureTimestamp;
            const isAfterCutoff = matchDate >= cutoffDate;
            
            if (sameLeague && isFinished && isBeforeFixture && isAfterCutoff) {
              console.log(`[Home Team ${homeTeamId}] ✓ Included: ${e.id} on ${matchDate.toISOString()}`);
            }
            
            return isFinished && isBeforeFixture && isAfterCutoff && sameLeague;
          })
          .sort((a: any, b: any) => b.startTimestamp - a.startTimestamp); // Most recent first
          
          console.log(`[Home Team ${homeTeamId}] Filtered to ${filtered.length} matches`);
          
          return filtered.slice(0, 5).map((e: any) => ({
            result: e.winnerCode === 1 ? 'W' : e.winnerCode === 2 ? 'L' : 'D',
            homeScore: e.homeScore?.current ?? 0,
            awayScore: e.awayScore?.current ?? 0,
            opponent: e.homeTeam?.id === parseInt(homeTeamId) ? e.awayTeam?.name : e.homeTeam?.name,
            homeAway: e.homeTeam?.id === parseInt(homeTeamId) ? 'H' : 'A',
            date: new Date(e.startTimestamp * 1000).toLocaleDateString('en-GB'),
            competition: e.tournament?.uniqueTournament?.name,
          }));
        })()
      : [];

    // Process away team form - last 5 finished matches in same competition
    const awayForm = awayFormData.status === 'fulfilled'
      ? (() => {
          const allEvents = awayFormData.value.events || [];
          console.log(`[Away Team ${awayTeamId}] Total events returned: ${allEvents.length}`);
          
          const filtered = allEvents.filter((e: any) => {
            const matchDate = new Date(e.startTimestamp * 1000);
            const sameLeague = !leagueId || e.tournament?.uniqueTournament?.id === parseInt(leagueId);
            const isFinished = e.status?.type === 'finished';
            const isBeforeFixture = e.startTimestamp < fixtureTimestamp;
            const isAfterCutoff = matchDate >= cutoffDate;
            
            return isFinished && isBeforeFixture && isAfterCutoff && sameLeague;
          })
          .sort((a: any, b: any) => b.startTimestamp - a.startTimestamp); // Most recent first
          
          console.log(`[Away Team ${awayTeamId}] Filtered to ${filtered.length} matches`);
          
          return filtered.slice(0, 5).map((e: any) => ({
            result: e.winnerCode === 2 ? 'W' : e.winnerCode === 1 ? 'L' : 'D',
            homeScore: e.homeScore?.current ?? 0,
            awayScore: e.awayScore?.current ?? 0,
            opponent: e.awayTeam?.id === parseInt(awayTeamId) ? e.homeTeam?.name : e.awayTeam?.name,
            homeAway: e.awayTeam?.id === parseInt(awayTeamId) ? 'A' : 'H',
            date: new Date(e.startTimestamp * 1000).toLocaleDateString('en-GB'),
            competition: e.tournament?.uniqueTournament?.name,
          }));
        })()
      : [];

    // Process odds - Over/Under 2.5 goals
    let formattedOdds = null;
    if (oddsData.status === 'fulfilled') {
      const markets = oddsData.value?.markets || [];
      const overUnderMarket = markets.find((m: any) => 
        m.marketName === 'Match goals' && m.choiceGroup === '2.5'
      );
      
      if (overUnderMarket && overUnderMarket.choices && overUnderMarket.choices.length >= 2) {
        formattedOdds = {
          over: overUnderMarket.choices[0]?.fractionalValue || 'N/A',
          under: overUnderMarket.choices[1]?.fractionalValue || 'N/A',
        };
        console.log('Over/Under 2.5 odds:', formattedOdds);
      } else {
        console.log('No Over/Under 2.5 market found. Available markets:', markets.map((m: any) => `${m.marketName} (${m.choiceGroup || 'no group'})`));
      }
    } else {
      console.log('Odds fetch failed:', oddsData.status === 'rejected' ? oddsData.reason : 'Unknown');
    }

    return NextResponse.json({
      homeForm,
      awayForm,
      odds: formattedOdds,
    });
  } catch (err: any) {
    console.error('Fixture details error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
