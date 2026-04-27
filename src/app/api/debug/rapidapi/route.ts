import { NextRequest, NextResponse } from 'next/server';
import { fetchRapidApiDebugFixtures } from '@/lib/rapidapi-debug';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date') || undefined;
  const tournamentIdParam = searchParams.get('tournamentId');
  const tournamentId = tournamentIdParam ? parseInt(tournamentIdParam, 10) : undefined;
  const result = await fetchRapidApiDebugFixtures(date, tournamentId);

  return NextResponse.json(result, {
    status: result.ok ? 200 : 502,
  });
}
