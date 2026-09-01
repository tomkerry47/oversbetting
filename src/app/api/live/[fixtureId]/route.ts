import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { fetchBsdMatch } from '@/lib/bsd-api';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: { fixtureId: string } }) {
  try {
    const fixtureId = Number(params.fixtureId);
    const { data: fixture, error } = await supabase.from('fixtures').select('*').eq('id', fixtureId).single();
    if (error) throw error;
    const { data: selections } = await supabase
      .from('selections')
      .select('player_name')
      .eq('fixture_id', fixtureId);
    const pickedBy = (selections || []).map((selection) => selection.player_name);
    if (fixture.data_provider !== 'bsd' || !fixture.bsd_event_id) {
      return NextResponse.json({ fixture, live: null, pickedBy, message: 'Live match centre is available for BSD fixtures only.' });
    }
    const live = await fetchBsdMatch(fixture.bsd_event_id, true, false);
    return NextResponse.json({ fixture, live, pickedBy, refreshedAt: new Date().toISOString() });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to load match centre' }, { status: 500 });
  }
}
