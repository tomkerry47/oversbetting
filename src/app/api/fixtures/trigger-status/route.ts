import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const runId = searchParams.get('runId');

    if (!runId) {
      return NextResponse.json({ error: 'Missing runId' }, { status: 400 });
    }

    const token = process.env.GITHUB_ACTIONS_TRIGGER_TOKEN;
    const owner = process.env.GITHUB_REPO_OWNER || process.env.VERCEL_GIT_REPO_OWNER;
    const repo = process.env.GITHUB_REPO_NAME || process.env.VERCEL_GIT_REPO_SLUG;

    if (!token || !owner || !repo) {
      return NextResponse.json(
        { error: 'Missing GitHub trigger configuration' },
        { status: 400 }
      );
    }

    const runUrl = `https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}`;
    const response = await fetch(runUrl, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Failed to fetch workflow run status:', response.status, errorBody);
      return NextResponse.json({ error: 'Failed to fetch workflow status' }, { status: 502 });
    }

    const run = await response.json();
    return NextResponse.json({
      id: run.id,
      status: run.status, // queued | in_progress | completed
      conclusion: run.conclusion, // success | failure | ...
      html_url: run.html_url,
      run_number: run.run_number,
    });
  } catch (error: any) {
    console.error('Workflow status API error:', error);
    return NextResponse.json(
      { error: error?.message || 'Unknown workflow status error' },
      { status: 500 }
    );
  }
}
