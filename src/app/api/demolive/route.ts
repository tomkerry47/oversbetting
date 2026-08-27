import { NextResponse } from 'next/server';
import { bsdRequest, parseBsdMatch } from '@/lib/bsd-api';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const payload = await bsdRequest('/events/live/');
    const events = payload?.events || payload?.results || payload?.data || [];
    const matches = (Array.isArray(events) ? events : []).map((event: any) => {
      const parsed = parseBsdMatch(event);
      return {
        id: event.id || event.event_id,
        league: event.league_name || event.league?.name || `League ${event.league_id || ''}`.trim(),
        homeTeam: event.home_team?.name || event.home_team || event.home?.name || 'Home',
        awayTeam: event.away_team?.name || event.away_team || event.away?.name || 'Away',
        homeScore: parsed.homeScore,
        awayScore: parsed.awayScore,
        minute: parsed.minute,
        second: parsed.second,
        clockUpdatedAt: parsed.clockUpdatedAt,
        status: parsed.status,
        liveWebsocket: Boolean(event.live_websocket),
        websocketPlus: Boolean(event.websocket_plus),
        stats: {
          shotsOnTarget: { home: parsed.homeShotsOnTarget, away: parsed.awayShotsOnTarget },
          shots: { home: parsed.homeShots, away: parsed.awayShots },
          xg: { home: parsed.homeXg, away: parsed.awayXg },
          possession: { home: parsed.homePossession, away: parsed.awayPossession },
          corners: { home: parsed.homeCorners, away: parsed.awayCorners },
        },
      };
    });
    return NextResponse.json({ matches, refreshedAt: new Date().toISOString() });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to load BSD live games' }, { status: 502 });
  }
}
