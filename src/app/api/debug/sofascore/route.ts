import { NextRequest, NextResponse } from 'next/server';
import { fetchSofaScoreDebugFixtures } from '@/lib/sofascore-debug';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date') || undefined;
  const result = await fetchSofaScoreDebugFixtures(date);

  return NextResponse.json(result, {
    status: result.ok ? 200 : 502,
  });
}
