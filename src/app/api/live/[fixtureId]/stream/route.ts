import { supabase } from '@/lib/supabase';
import { createBsdLiveEventStream } from '@/lib/bsd-api';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(_request: Request, { params }: { params: { fixtureId: string } }) {
  const { data: fixture, error } = await supabase.from('fixtures')
    .select('bsd_event_id,data_provider').eq('id', params.fixtureId).maybeSingle();
  if (error) return new Response('Unable to load fixture', { status: 500 });
  if (!fixture?.bsd_event_id || fixture.data_provider !== 'bsd') return new Response('BSD live feed unavailable', { status: 404 });
  return createBsdLiveEventStream(Number(fixture.bsd_event_id));
}
