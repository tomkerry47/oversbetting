import { createBsdLiveEventStream } from '@/lib/bsd-api';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(_request: Request, { params }: { params: { eventId: string } }) {
  const eventId = Number(params.eventId);
  if (!Number.isInteger(eventId) || eventId <= 0) return new Response('Invalid event ID', { status: 400 });
  return createBsdLiveEventStream(eventId);
}
