import { NextRequest, NextResponse } from 'next/server';

type DispatchBody = {
  ref: string;
  inputs: Record<string, string>;
};

async function findLatestWorkflowRun(
  owner: string,
  repo: string,
  workflowFile: string,
  ref: string,
  token: string
): Promise<number | null> {
  const runsUrl = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowFile}/runs?event=workflow_dispatch&branch=${encodeURIComponent(ref)}&per_page=5`;
  const runsResponse = await fetch(runsUrl, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!runsResponse.ok) {
    return null;
  }

  const runsData = await runsResponse.json();
  const runs = runsData?.workflow_runs || [];
  if (runs.length === 0) return null;

  return runs[0]?.id ?? null;
}

export async function POST(request: NextRequest) {
  try {
    const { weekOffset, targetDate, kickoffTime, isCustom, enrich, enrichOdds, bsdOnly } = await request.json().catch(() => ({ weekOffset: 1 }));
    const workflowWeekOffset = Number.isFinite(Number(weekOffset))
      ? String(Math.max(0, Math.floor(Number(weekOffset))))
      : '1';
    const hasExplicitTarget = Boolean(targetDate && kickoffTime);
    const workflowIsCustom =
      typeof isCustom === 'boolean' ? String(isCustom) : hasExplicitTarget ? 'true' : 'false';
    const workflowEnrich = typeof enrich === 'boolean' ? String(enrich) : 'false';
    const workflowEnrichOdds = typeof enrichOdds === 'boolean' ? String(enrichOdds) : 'false';
    const workflowBsdOnly = typeof bsdOnly === 'boolean' ? String(bsdOnly) : 'false';
    const workflowRequestBudget = '20';

    // Always dispatch an explicit refresh. The hybrid job upserts by provider
    // ID, so rerunning safely refreshes BSD predictions/odds without creating
    // duplicate fixtures.

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
        ...(hasExplicitTarget ? { target_date: String(targetDate), kickoff_time: String(kickoffTime) } : {}),
        is_custom: workflowIsCustom,
        enrich: workflowEnrich,
        enrich_odds: workflowEnrichOdds,
        request_budget: workflowRequestBudget,
        bsd_only: workflowBsdOnly,
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

    // Dispatch API does not return a run id; fetch latest run for this workflow/branch.
    // Small delay avoids a race where the run isn't visible immediately.
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const runId = await findLatestWorkflowRun(owner, repo, workflowFile, ref, token);

    return NextResponse.json({
      ok: true,
      message: 'Fixture sync workflow triggered',
      weekOffset: workflowWeekOffset,
      targetDate: hasExplicitTarget ? String(targetDate) : null,
      kickoffTime: hasExplicitTarget ? String(kickoffTime) : null,
      isCustom: workflowIsCustom,
      enrich: workflowEnrich,
      enrichOdds: workflowEnrichOdds,
      requestBudget: workflowRequestBudget,
      bsdOnly: workflowBsdOnly,
      runId,
    });
  } catch (error: any) {
    console.error('Workflow trigger error:', error);
    return NextResponse.json(
      { error: error?.message || 'Unknown workflow trigger error' },
      { status: 500 }
    );
  }
}
