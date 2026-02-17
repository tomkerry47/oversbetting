import { NextRequest, NextResponse } from 'next/server';

type DispatchBody = {
  ref: string;
  inputs: Record<string, string>;
};

export async function POST(request: NextRequest) {
  try {
    const { weekOffset } = await request.json().catch(() => ({ weekOffset: 1 }));
    const workflowWeekOffset = Number.isFinite(Number(weekOffset))
      ? String(Math.max(0, Math.floor(Number(weekOffset))))
      : '1';

    const token = process.env.GITHUB_ACTIONS_TRIGGER_TOKEN;
    const owner = process.env.GITHUB_REPO_OWNER || process.env.VERCEL_GIT_REPO_OWNER;
    const repo = process.env.GITHUB_REPO_NAME || process.env.VERCEL_GIT_REPO_SLUG;
    const workflowFile =
      process.env.GITHUB_FIXTURES_WORKFLOW_FILE || 'fetch-next-week-fixtures.yml';
    const ref = process.env.GITHUB_FIXTURES_WORKFLOW_REF || 'main';

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

    const dispatchUrl = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowFile}/dispatches`;
    const body: DispatchBody = {
      ref,
      inputs: {
        week_offset: workflowWeekOffset,
      },
    };

    const response = await fetch(dispatchUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Failed to dispatch GitHub workflow:', response.status, errorBody);
      return NextResponse.json(
        { error: 'Failed to trigger fixture sync workflow' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: 'Fixture sync workflow triggered',
      weekOffset: workflowWeekOffset,
    });
  } catch (error: any) {
    console.error('Workflow trigger error:', error);
    return NextResponse.json(
      { error: error?.message || 'Unknown workflow trigger error' },
      { status: 500 }
    );
  }
}
