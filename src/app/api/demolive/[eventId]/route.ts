import { NextRequest, NextResponse } from 'next/server';
import { fetchBsdMatch } from '@/lib/bsd-api';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: { eventId: string } }) {
  try {
    const eventId = Number(params.eventId);
    if (!Number.isInteger(eventId)) return NextResponse.json({ error: 'Invalid BSD event id' }, { status: 400 });
    const live = await fetchBsdMatch(eventId, true);
    return NextResponse.json({ eventId, live, refreshedAt: new Date().toISOString() });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to load BSD match feed' }, { status: 502 });
  }
}

