import { NextResponse } from "next/server";

import { resolveGithubBranch, resolveGithubRepoUrl } from "../../../../lib/plex";

export const dynamic = "force-dynamic";

interface GitHubPullRequestResponse {
  number: number;
  state: string;
  merged: boolean;
  title: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  merged_at: string | null;
  merge_commit_sha: string | null;
  head: {
    ref: string;
    sha: string;
  };
  base: {
    ref: string;
  };
}

interface GitHubWorkflowRunResponse {
  id: number;
  name: string;
  display_title: string;
  path: string;
  html_url: string;
  event: string;
  status: string;
  conclusion: string | null;
  head_branch: string;
  head_sha: string;
  run_number: number;
  run_attempt: number;
  created_at: string;
  updated_at: string;
}

interface GitHubWorkflowRunsEnvelope {
  workflow_runs: GitHubWorkflowRunResponse[];
}

interface TransactionWorkflowRun {
  id: number;
  name: string;
  title: string;
  workflowPath: string;
  htmlUrl: string;
  event: string;
  status: string;
  conclusion: string | null;
  headBranch: string;
  headSha: string;
  runNumber: number;
  runAttempt: number;
  createdAt: string;
  updatedAt: string;
}

type PipelineStatus = "pending" | "running" | "success" | "failed" | "waiting-merge";

interface TransactionStatusResponse {
  pullRequest: {
    number: number;
    title: string;
    htmlUrl: string;
    state: string;
    merged: boolean;
    createdAt: string;
    updatedAt: string;
    closedAt: string | null;
    mergedAt: string | null;
    mergeCommitSha: string | null;
    headRef: string;
    headSha: string;
    baseRef: string;
  };
  pipeline: {
    status: PipelineStatus;
    message: string;
    notifications: string[];
    runs: {
      prCheck: TransactionWorkflowRun | null;
      reconcileUpdate: TransactionWorkflowRun | null;
      svcsBuildDeploy: TransactionWorkflowRun | null;
    };
  };
}

function parseGithubRepoCoordinates(repoUrl: string): { owner: string; repo: string } | null {
  const trimmed = repoUrl.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname !== "github.com") {
      return null;
    }
    const parts = parsed.pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
    if (parts.length < 2) {
      return null;
    }
    return {
      owner: parts[0],
      repo: parts[1].replace(/\.git$/i, "")
    };
  } catch {
    return null;
  }
}

function asErrorDetail(payload: unknown): string {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
  }
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  return "unknown error";
}

async function githubGet<T>(path: string, token: string): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`https://api.github.com${path}`, {
    cache: "no-store",
    headers
  });
  const raw = await response.text();
  let payload: unknown = {};
  if (raw) {
    try {
      payload = JSON.parse(raw) as unknown;
    } catch {
      payload = { message: raw };
    }
  }

  if (!response.ok) {
    const detail = asErrorDetail(payload);
    throw new Error(`github api ${response.status} for ${path}: ${detail}`);
  }

  return payload as T;
}

function isWorkflowPath(run: GitHubWorkflowRunResponse, workflowFile: string): boolean {
  return run.path.endsWith(`/${workflowFile}`) || run.path.includes(workflowFile);
}

function toTimestampMs(value: string | null): number {
  if (!value) {
    return Number.NaN;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.NaN : parsed;
}

function mapRun(run: GitHubWorkflowRunResponse | null): TransactionWorkflowRun | null {
  if (!run) {
    return null;
  }
  return {
    id: run.id,
    name: run.name,
    title: run.display_title || run.name,
    workflowPath: run.path,
    htmlUrl: run.html_url,
    event: run.event,
    status: run.status,
    conclusion: run.conclusion,
    headBranch: run.head_branch,
    headSha: run.head_sha,
    runNumber: run.run_number,
    runAttempt: run.run_attempt,
    createdAt: run.created_at,
    updatedAt: run.updated_at
  };
}

function selectRunAfter(
  runs: GitHubWorkflowRunResponse[],
  workflowFile: string,
  thresholdMs: number
): GitHubWorkflowRunResponse | null {
  for (const run of runs) {
    if (!isWorkflowPath(run, workflowFile)) {
      continue;
    }
    const createdAtMs = toTimestampMs(run.created_at);
    if (Number.isFinite(thresholdMs) && Number.isFinite(createdAtMs) && createdAtMs < thresholdMs) {
      continue;
    }
    return run;
  }
  return null;
}

function selectPipelineStatus(
  pullRequest: GitHubPullRequestResponse,
  prCheckRun: GitHubWorkflowRunResponse | null,
  reconcileRun: GitHubWorkflowRunResponse | null,
  svcsRun: GitHubWorkflowRunResponse | null
): { status: PipelineStatus; message: string; notifications: string[] } {
  const notifications: string[] = [];

  if (pullRequest.merged) {
    notifications.push(`PR #${pullRequest.number} has been merged.`);
  } else if (pullRequest.state === "open") {
    notifications.push(`PR #${pullRequest.number} is open.`);
  } else {
    notifications.push(`PR #${pullRequest.number} is ${pullRequest.state}.`);
  }

  if (pullRequest.merged_at) {
    notifications.push(`Merged at ${new Date(pullRequest.merged_at).toLocaleString()}.`);
  }

  if (!pullRequest.merged) {
    if (!prCheckRun) {
      return {
        status: "pending",
        message: "Waiting for PR reconcile workflow to start.",
        notifications
      };
    }
    if (prCheckRun.status !== "completed") {
      notifications.push("TARS PR reconcile is running.");
      return {
        status: "running",
        message: "PR checks are running.",
        notifications
      };
    }
    if (prCheckRun.conclusion === "success") {
      notifications.push("PR checks passed. Waiting for merge.");
      return {
        status: "waiting-merge",
        message: "PR checks passed. Waiting for merge.",
        notifications
      };
    }
    notifications.push(`PR checks finished with ${prCheckRun.conclusion || "unknown"} state.`);
    return {
      status: "failed",
      message: `PR checks failed (${prCheckRun.conclusion || "unknown"}).`,
      notifications
    };
  }

  if (!reconcileRun) {
    return {
      status: "pending",
      message: "Waiting for TARS reconcile/update workflow to start.",
      notifications
    };
  }

  if (reconcileRun.status !== "completed") {
    notifications.push("TARS reconcile/update is running.");
    return {
      status: "running",
      message: "TARS reconcile/update is running.",
      notifications
    };
  }

  if (reconcileRun.conclusion !== "success") {
    notifications.push(`TARS reconcile/update ended with ${reconcileRun.conclusion || "unknown"} state.`);
    return {
      status: "failed",
      message: `TARS reconcile/update failed (${reconcileRun.conclusion || "unknown"}).`,
      notifications
    };
  }

  if (!svcsRun) {
    return {
      status: "pending",
      message: "Waiting for SVCS build/deploy workflow to start.",
      notifications
    };
  }

  if (svcsRun.status !== "completed") {
    notifications.push("SVCS build/deploy is running.");
    return {
      status: "running",
      message: "SVCS build/deploy is running.",
      notifications
    };
  }

  if (svcsRun.conclusion === "success") {
    notifications.push("SVCS build/deploy finished successfully.");
    return {
      status: "success",
      message: "Pipeline finished successfully.",
      notifications
    };
  }

  notifications.push(`SVCS build/deploy ended with ${svcsRun.conclusion || "unknown"} state.`);
  return {
    status: "failed",
    message: `SVCS build/deploy failed (${svcsRun.conclusion || "unknown"}).`,
    notifications
  };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ pullRequestNumber: string }> }
) {
  const { pullRequestNumber } = await context.params;
  const prNumber = Number.parseInt(pullRequestNumber, 10);
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    return NextResponse.json({ detail: "pullRequestNumber must be a positive integer" }, { status: 400 });
  }

  const coordinates = parseGithubRepoCoordinates(resolveGithubRepoUrl());
  if (!coordinates) {
    return NextResponse.json({ detail: "unable to resolve GitHub owner/repo from CASE_GITHUB_REPO_URL" }, { status: 500 });
  }

  const token = process.env.CASE_GITHUB_TOKEN || process.env.GITHUB_TOKEN || process.env.CASE_AUTOMERGE_TOKEN || "";
  const branch = resolveGithubBranch();

  try {
    const pullRequest = await githubGet<GitHubPullRequestResponse>(
      `/repos/${encodeURIComponent(coordinates.owner)}/${encodeURIComponent(coordinates.repo)}/pulls/${prNumber}`,
      token
    );

    const [prRunsEnvelope, mainRunsEnvelope] = await Promise.all([
      githubGet<GitHubWorkflowRunsEnvelope>(
        `/repos/${encodeURIComponent(coordinates.owner)}/${encodeURIComponent(coordinates.repo)}/actions/runs?event=pull_request&branch=${encodeURIComponent(pullRequest.head.ref)}&per_page=30`,
        token
      ),
      githubGet<GitHubWorkflowRunsEnvelope>(
        `/repos/${encodeURIComponent(coordinates.owner)}/${encodeURIComponent(coordinates.repo)}/actions/runs?branch=${encodeURIComponent(branch)}&per_page=60`,
        token
      )
    ]);

    const prRuns = [...prRunsEnvelope.workflow_runs].sort(
      (left, right) => toTimestampMs(right.created_at) - toTimestampMs(left.created_at)
    );
    const mainRuns = [...mainRunsEnvelope.workflow_runs].sort(
      (left, right) => toTimestampMs(right.created_at) - toTimestampMs(left.created_at)
    );

    const prCheckRun = selectRunAfter(prRuns, "tars-pr.yml", Number.NEGATIVE_INFINITY);

    let reconcileRun: GitHubWorkflowRunResponse | null = null;
    const mergeCommitSha = pullRequest.merge_commit_sha?.trim() || "";
    const mergedAtMs = toTimestampMs(pullRequest.merged_at);
    const mergedThresholdMs = Number.isFinite(mergedAtMs) ? mergedAtMs - 10 * 60_000 : Number.NEGATIVE_INFINITY;
    if (mergeCommitSha) {
      reconcileRun =
        mainRuns.find((run) => isWorkflowPath(run, "tars-build.yml") && run.head_sha === mergeCommitSha) || null;
    }
    if (!reconcileRun) {
      reconcileRun = selectRunAfter(mainRuns, "tars-build.yml", mergedThresholdMs);
    }

    const svcsThresholdMs = Number.isFinite(toTimestampMs(reconcileRun?.created_at || ""))
      ? toTimestampMs(reconcileRun?.created_at || "") - 60_000
      : mergedThresholdMs;
    const svcsRun = selectRunAfter(mainRuns, "svcs-build.yml", svcsThresholdMs);

    const pipelineState = selectPipelineStatus(pullRequest, prCheckRun, reconcileRun, svcsRun);

    const response: TransactionStatusResponse = {
      pullRequest: {
        number: pullRequest.number,
        title: pullRequest.title,
        htmlUrl: pullRequest.html_url,
        state: pullRequest.state,
        merged: pullRequest.merged,
        createdAt: pullRequest.created_at,
        updatedAt: pullRequest.updated_at,
        closedAt: pullRequest.closed_at,
        mergedAt: pullRequest.merged_at,
        mergeCommitSha: pullRequest.merge_commit_sha,
        headRef: pullRequest.head.ref,
        headSha: pullRequest.head.sha,
        baseRef: pullRequest.base.ref
      },
      pipeline: {
        status: pipelineState.status,
        message: pipelineState.message,
        notifications: pipelineState.notifications,
        runs: {
          prCheck: mapRun(prCheckRun),
          reconcileUpdate: mapRun(reconcileRun),
          svcsBuildDeploy: mapRun(svcsRun)
        }
      }
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ detail: `unable to resolve transaction status: ${detail}` }, { status: 502 });
  }
}
