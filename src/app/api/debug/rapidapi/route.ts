import { NextRequest, NextResponse } from 'next/server';
import { fetchRapidApiDebugFixtures } from '@/lib/rapidapi-debug';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date') || undefined;
  const leagueIdParam = searchParams.get('leagueId') ?? searchParams.get('tournamentId');
  const leagueId = leagueIdParam ? parseInt(leagueIdParam, 10) : undefined;
  const result = await fetchRapidApiDebugFixtures(date, leagueId);

  return NextResponse.json(result, {
    status: result.ok ? 200 : 502,
  });
}
