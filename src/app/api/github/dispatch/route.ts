import { NextRequest, NextResponse } from 'next/server';

/**
 * GitHub Actions API: list-workflow-runs 응답 중 우리가 참조하는 필드만 가진 좁은 타입.
 * octokit 타입 의존을 추가하지 않기 위해 필요한 필드만 정의한다.
 */
interface GitHubWorkflowRun {
  id: number;
  path: string;
}

interface GitHubWorkflowRunsResponse {
  workflow_runs?: GitHubWorkflowRun[];
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { targetUrl } = body;

    if (!targetUrl) {
      return NextResponse.json({ error: 'Target URL is required' }, { status: 400 });
    }

    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const workflowId = 'audit.yml'; // Filename of the workflow
    const ref = 'main'; // Target branch

    if (!token || !owner || !repo) {
      return NextResponse.json({
        error: 'GitHub configuration missing. Please set GITHUB_TOKEN, GITHUB_OWNER, and GITHUB_REPO.'
      }, { status: 500 });
    }

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ref: ref,
          inputs: {
            target_url: targetUrl,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('GitHub API Error:', errorText);
      return NextResponse.json({ error: `GitHub API Failed: ${response.status} ${response.statusText}` }, { status: response.status });
    }

    // 트리거 후 최신 워크플로우 run_id 조회 (약간의 딜레이 후)
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 최신 워크플로우 실행 조회
    const runsResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/runs?per_page=5`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    );

    let runId: number | null = null;
    if (runsResponse.ok) {
      const runsData = (await runsResponse.json()) as GitHubWorkflowRunsResponse;
      const auditRuns = (runsData.workflow_runs ?? []).filter(
        (run) => run.path === '.github/workflows/audit.yml'
      );
      if (auditRuns.length > 0) {
        runId = auditRuns[0].id;
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Workflow dispatched successfully',
      runId: runId,
      workflowUrl: `https://github.com/${owner}/${repo}/actions`
    });

  } catch (error: unknown) {
    console.error('Dispatch error:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
