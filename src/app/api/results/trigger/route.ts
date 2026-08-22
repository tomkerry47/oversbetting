import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

type DispatchBody = {
  ref: string;
  inputs: Record<string, string>;
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const weekId = body?.week_id;

    // BSD-supported selections can be resolved synchronously in this request;
    // reserve the slower GitHub workflow for rounds containing SofaScore picks.
    if (weekId !== undefined && weekId !== null && `${weekId}`.trim() !== '') {
      const { data: selections, error: selectionError } = await supabase
        .from('selections')
        .select('fixture:fixtures(data_provider, bsd_event_id)')
        .eq('week_id', Number(weekId));
      if (selectionError) throw selectionError;
      const allSelectedFixturesUseBsd = Boolean(selections?.length) && selections.every((selection: any) =>
        selection.fixture?.data_provider === 'bsd' && selection.fixture?.bsd_event_id
      );

      if (allSelectedFixturesUseBsd) {
        const directResponse = await fetch(new URL('/api/results', request.url), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ week_id: Number(weekId) }),
          cache: 'no-store',
        });
        const directBody = await directResponse.json().catch(() => ({}));
        if (!directResponse.ok) {
          return NextResponse.json(
            { error: directBody.error || 'Direct BSD results check failed' },
            { status: directResponse.status }
          );
        }
        return NextResponse.json({
          ok: true,
          mode: 'direct',
          message: 'BSD results updated',
          week_id: `${weekId}`,
        });
      }
    }

    const token = process.env.GITHUB_ACTIONS_TRIGGER_TOKEN;
    const owner = process.env.GITHUB_REPO_OWNER || process.env.VERCEL_GIT_REPO_OWNER;
    const repo = process.env.GITHUB_REPO_NAME || process.env.VERCEL_GIT_REPO_SLUG;
    const workflowFile = process.env.GITHUB_RESULTS_WORKFLOW_FILE || 'process-results.yml';
    const ref = process.env.GITHUB_RESULTS_WORKFLOW_REF || 'main';

    if (!token || !owner || !repo) {
      const missing: string[] = [];
      if (!token) missing.push('GITHUB_ACTIONS_TRIGGER_TOKEN');
      if (!owner) missing.push('GITHUB_REPO_OWNER (or VERCEL_GIT_REPO_OWNER)');
      if (!repo) missing.push('GITHUB_REPO_NAME (or VERCEL_GIT_REPO_SLUG)');
      return NextResponse.json(
        {
          error: `Missing GitHub trigger configuration: ${missing.join(', ')}`,
        },
        { status: 400 }
      );
    }

    const inputs: Record<string, string> = {};
    if (weekId !== undefined && weekId !== null && `${weekId}`.trim() !== '') {
      inputs.week_id = `${weekId}`;
    }

    const dispatchUrl = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowFile}/dispatches`;
    const payload: DispatchBody = {
      ref,
      inputs,
    };

    const response = await fetch(dispatchUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Failed to dispatch results workflow:', response.status, errorBody);
      return NextResponse.json(
        { error: 'Failed to trigger results workflow' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: 'Results workflow triggered',
      week_id: inputs.week_id || null,
    });
  } catch (error: any) {
    console.error('Results workflow trigger error:', error);
    return NextResponse.json(
      { error: error?.message || 'Unknown results workflow trigger error' },
      { status: 500 }
    );
  }
}
