import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fixtureId = searchParams.get('fixtureId');

    if (!fixtureId) {
      return NextResponse.json({ error: 'Missing fixtureId' }, { status: 400 });
    }

    const apiFixtureId = parseInt(fixtureId, 10);
    if (Number.isNaN(apiFixtureId)) {
      return NextResponse.json({ error: 'Invalid fixtureId' }, { status: 400 });
    }

    const { data: fixture, error } = await supabase
      .from('fixtures')
      .select('home_form, away_form, odds_over_25, odds_under_25, insights_updated_at')
      .eq('api_fixture_id', apiFixtureId)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!fixture) {
      return NextResponse.json({ homeForm: [], awayForm: [], odds: null });
    }

    return NextResponse.json({
      homeForm: fixture.home_form || [],
      awayForm: fixture.away_form || [],
      odds:
        fixture.odds_over_25 || fixture.odds_under_25
          ? {
              over: fixture.odds_over_25 || 'N/A',
              under: fixture.odds_under_25 || 'N/A',
            }
          : null,
      cachedAt: fixture.insights_updated_at || null,
    });
  } catch (err: any) {
    console.error('Fixture details cache API error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
