import { NextResponse } from 'next/server';
import { bsdRequest } from '@/lib/bsd-api';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: { eventId: string } }) {
  try {
    const eventId = Number(params.eventId);
    if (!Number.isInteger(eventId) || eventId <= 0) return NextResponse.json({ error: 'Invalid event ID' }, { status: 400 });
    return NextResponse.json(await bsdRequest(`/events/${eventId}/lineups/`));
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to load lineups' }, { status: 502 });
  }
}
