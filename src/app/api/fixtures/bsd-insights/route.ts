import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { bsdRequest, numberAt } from '@/lib/bsd-api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const fixtureId = Number(request.nextUrl.searchParams.get('fixtureId'));
    if (!Number.isInteger(fixtureId) || fixtureId <= 0) return NextResponse.json({ error: 'Invalid fixture ID' }, { status: 400 });
    const { data: fixture, error } = await supabase.from('fixtures')
      .select('data_provider,bsd_event_id').eq('id', fixtureId).maybeSingle();
    if (error) throw error;
    if (!fixture?.bsd_event_id || fixture.data_provider !== 'bsd') return NextResponse.json({ error: 'BSD insights unavailable' }, { status: 404 });

    const prediction = await bsdRequest(`/events/${fixture.bsd_event_id}/prediction/`);
    const markets = prediction?.markets || prediction?.prediction?.markets || {};
    const expectedHomeGoals = numberAt(markets, [['expected_goals', 'home']]);
    const expectedAwayGoals = numberAt(markets, [['expected_goals', 'away']]);
    return NextResponse.json({
      predictedScore: markets?.score?.most_likely || null,
      expectedHomeGoals,
      expectedAwayGoals,
      expectedTotalGoals: expectedHomeGoals != null && expectedAwayGoals != null
        ? expectedHomeGoals + expectedAwayGoals : null,
      predictionUpdatedAt: prediction?.created_at || null,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to load BSD insights' }, { status: 502 });
  }
}
