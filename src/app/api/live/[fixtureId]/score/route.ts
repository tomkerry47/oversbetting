import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { fetchBsdScore } from '@/lib/bsd-api';

export const dynamic = 'force-dynamic';
const ONE_MINUTE = 60 * 1000;

function shortStatus(value: unknown) {
  const status = String(value || '').toLowerCase().replaceAll('_', '');
  if (['finished', 'ft', 'ended'].includes(status)) return 'FT';
  if (['halftime', 'ht'].includes(status)) return 'HT';
  if (['inprogress', 'live', '1sthalf', '2ndhalf', 'halftime', 'extratime', 'penalties', 'paused'].includes(status)) return 'LIVE';
  if (['postponed', 'cancelled', 'canceled'].includes(status)) return 'PST';
  return 'NS';
}

export async function GET(_request: NextRequest, { params }: { params: { fixtureId: string } }) {
  try {
    const fixtureId = Number(params.fixtureId);
    const { data: fixture, error } = await supabase
      .from('fixtures')
      .select('id,bsd_event_id,data_provider,home_score,away_score,match_status,live_updated_at')
      .eq('id', fixtureId)
      .single();
    if (error) throw error;
    if (fixture.data_provider !== 'bsd' || !fixture.bsd_event_id) {
      return NextResponse.json({ live: null, message: 'BSD live score unavailable.' });
    }

    let live = await fetchBsdScore(Number(fixture.bsd_event_id));
    if (fixture.match_status === 'FT') live = { ...live, status: 'finished' };
    const homeScore = live.homeScore ?? fixture.home_score ?? 0;
    const awayScore = live.awayScore ?? fixture.away_score ?? 0;
    const matchStatus = fixture.match_status === 'FT' ? 'FT' : shortStatus(live.status);
    const persistenceDue =
      Number(fixture.home_score ?? 0) !== Number(homeScore) ||
      Number(fixture.away_score ?? 0) !== Number(awayScore) ||
      fixture.match_status !== matchStatus ||
      !fixture.live_updated_at ||
      Date.now() - new Date(fixture.live_updated_at).getTime() >= ONE_MINUTE;

    if (persistenceDue) {
      await supabase.from('fixtures').update({
        home_score: homeScore,
        away_score: awayScore,
        match_status: matchStatus,
        live_updated_at: new Date().toISOString(),
      }).eq('id', fixture.id);
    }

    return NextResponse.json({ live, refreshedAt: new Date().toISOString() });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to refresh live score' }, { status: 500 });
  }
}
