import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { bsdRequest } from '@/lib/bsd-api';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: { fixtureId: string } }) {
  try {
    const { data: fixture, error } = await supabase.from('fixtures')
      .select('bsd_event_id,data_provider').eq('id', params.fixtureId).maybeSingle();
    if (error) throw error;
    if (!fixture?.bsd_event_id || fixture.data_provider !== 'bsd') return NextResponse.json({ error: 'BSD lineups unavailable' }, { status: 404 });
    return NextResponse.json(await bsdRequest(`/events/${fixture.bsd_event_id}/lineups/`));
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to load lineups' }, { status: 502 });
  }
}
