import { NextRequest, NextResponse } from 'next/server';

type DispatchBody = {
  ref: string;
  inputs: Record<string, string>;
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const weekId = body?.week_id;

    const token = process.env.GITHUB_ACTIONS_TRIGGER_TOKEN;
    const owner = process.env.GITHUB_REPO_OWNER || process.env.VERCEL_GIT_REPO_OWNER;
    const repo = process.env.GITHUB_REPO_NAME || process.env.VERCEL_GIT_REPO_SLUG;
    const workflowFile = process.env.GITHUB_RESULTS_WORKFLOW_FILE || 'process-results.yml';
    const ref = process.env.GITHUB_RESULTS_WORKFLOW_REF || 'main';

    if (!token || !owner || !repo) {
      return NextResponse.json(
        {
          error:
            'Missing GitHub trigger configuration. Set GITHUB_ACTIONS_TRIGGER_TOKEN and repo owner/name (or rely on VERCEL_GIT_REPO_OWNER/VERCEL_GIT_REPO_SLUG).',
        },
        { status: 500 }
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
