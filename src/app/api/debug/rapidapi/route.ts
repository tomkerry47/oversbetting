import { NextRequest, NextResponse } from 'next/server';
import { fetchRapidApiDebugFixtures } from '@/lib/rapidapi-debug';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const categoryIdParam = searchParams.get('categoryId');
  const parsed = categoryIdParam !== null ? parseInt(categoryIdParam, 10) : NaN;
  const categoryId = !Number.isNaN(parsed) && parsed > 0 ? parsed : undefined;
  const result = await fetchRapidApiDebugFixtures(categoryId);

  return NextResponse.json(result, {
    status: result.ok ? 200 : 502,
  });
}
