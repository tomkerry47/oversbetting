import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { bsdMatchStatsSnapshot, fetchBsdStats } from '@/lib/bsd-api';

export const dynamic = 'force-dynamic';
const ONE_MINUTE = 60 * 1000;

export async function GET(_request: NextRequest, { params }: { params: { fixtureId: string } }) {
  try {
    const fixtureId = Number(params.fixtureId);
    const { data: fixture, error } = await supabase
      .from('fixtures')
      .select('id,bsd_event_id,data_provider,final_stats,stats_updated_at')
      .eq('id', fixtureId)
      .single();
    if (error) throw error;
    if (fixture.data_provider !== 'bsd' || !fixture.bsd_event_id) {
      return NextResponse.json({ stats: fixture.final_stats || null, cached: true });
    }

    const now = new Date();
    const cutoff = new Date(now.getTime() - ONE_MINUTE).toISOString();
    const { data: reserved, error: reserveError } = await supabase
      .from('fixtures')
      .update({ stats_updated_at: now.toISOString() })
      .eq('id', fixture.id)
      .or(`stats_updated_at.is.null,stats_updated_at.lt.${cutoff}`)
      .select('id')
      .maybeSingle();
    if (reserveError) throw reserveError;

    if (!reserved) {
      return NextResponse.json({ stats: fixture.final_stats || null, cached: true });
    }

    const stats = bsdMatchStatsSnapshot(await fetchBsdStats(Number(fixture.bsd_event_id)));
    const refreshedAt = new Date().toISOString();
    const { error: updateError } = await supabase.from('fixtures').update({
      final_stats: stats,
      stats_updated_at: refreshedAt,
    }).eq('id', fixture.id);
    if (updateError) throw updateError;

    return NextResponse.json({ stats, cached: false, refreshedAt });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to refresh match stats' }, { status: 500 });
  }
}
