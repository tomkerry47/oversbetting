import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { fetchBsdMatch } from '@/lib/bsd-api';

export const dynamic = 'force-dynamic';

type Pair = { home: number | null; away: number | null };

function numberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace('%', ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function emptyStats() {
  return {
    shotsOnTarget: { home: null, away: null } as Pair,
    shots: { home: null, away: null } as Pair,
    xg: { home: null, away: null } as Pair,
    possession: { home: null, away: null } as Pair,
    corners: { home: null, away: null } as Pair,
  };
}

function parseSofaStats(payload: any) {
  const stats = emptyStats();
  const periods = payload?.statistics || payload?.data?.statistics || [];
  const allPeriod = periods.find((period: any) => period.period === 'ALL') || periods[0];
  const items = (allPeriod?.groups || []).flatMap((group: any) => group.statisticsItems || group.items || []);
  const aliases: Record<string, keyof typeof stats> = {
    'shots on target': 'shotsOnTarget',
    'total shots': 'shots',
    'expected goals': 'xg',
    'ball possession': 'possession',
    'corner kicks': 'corners',
    corners: 'corners',
  };
  for (const item of items) {
    const key = aliases[String(item.name || item.label || '').toLowerCase()];
    if (!key) continue;
    stats[key] = {
      home: numberValue(item.home ?? item.homeValue),
      away: numberValue(item.away ?? item.awayValue),
    };
  }
  return stats;
}

async function fetchSofaStats(eventId: number) {
  const rapidKey = process.env.RAPIDAPI_KEY;
  const response = rapidKey
    ? await fetch(`https://sofascore.p.rapidapi.com/matches/get-statistics?matchId=${eventId}`, {
        headers: { 'x-rapidapi-host': 'sofascore.p.rapidapi.com', 'x-rapidapi-key': rapidKey },
        cache: 'no-store',
      })
    : await fetch(`https://api.sofascore.com/api/v1/event/${eventId}/statistics`, {
        headers: { Accept: 'application/json', Referer: 'https://www.sofascore.com/' },
        cache: 'no-store',
      });
  if (!response.ok) throw new Error(`SofaScore statistics returned ${response.status}`);
  return parseSofaStats(await response.json());
}

export async function GET(_request: NextRequest, { params }: { params: { fixtureId: string } }) {
  try {
    const fixtureId = Number(params.fixtureId);
    if (!Number.isInteger(fixtureId)) return NextResponse.json({ error: 'Invalid fixture id' }, { status: 400 });
    const { data: fixture, error } = await supabase.from('fixtures').select('*').eq('id', fixtureId).single();
    if (error) throw error;

    if (fixture.data_provider === 'bsd' && fixture.bsd_event_id) {
      if (fixture.match_status === 'FT' && fixture.final_stats) {
        const match = fixture.final_stats;
        return NextResponse.json({
          provider: 'bsd',
          stats: {
            shotsOnTarget: { home: match.homeShotsOnTarget, away: match.awayShotsOnTarget },
            shots: { home: match.homeShots, away: match.awayShots },
            xg: { home: match.homeXg, away: match.awayXg },
            possession: { home: match.homePossession, away: match.awayPossession },
            corners: { home: match.homeCorners, away: match.awayCorners },
          },
        });
      }
      const match = await fetchBsdMatch(Number(fixture.bsd_event_id));
      return NextResponse.json({
        provider: 'bsd',
        stats: {
          shotsOnTarget: { home: match.homeShotsOnTarget, away: match.awayShotsOnTarget },
          shots: { home: match.homeShots, away: match.awayShots },
          xg: { home: match.homeXg, away: match.awayXg },
          possession: { home: match.homePossession, away: match.awayPossession },
          corners: { home: match.homeCorners, away: match.awayCorners },
        },
      });
    }

    return NextResponse.json({ provider: 'sofascore', stats: await fetchSofaStats(fixture.provider_fixture_id || fixture.api_fixture_id) });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Match statistics are unavailable' }, { status: 502 });
  }
}
