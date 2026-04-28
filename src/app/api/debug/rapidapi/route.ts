import { NextRequest, NextResponse } from 'next/server';
import { fetchRapidApiDebugFixtures } from '@/lib/rapidapi-debug';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const categoryIdParam = searchParams.get('categoryId');
  const categoryId = categoryIdParam ? parseInt(categoryIdParam, 10) : undefined;
  const result = await fetchRapidApiDebugFixtures(categoryId);

  return NextResponse.json(result, {
    status: result.ok ? 200 : 502,
  });
}
