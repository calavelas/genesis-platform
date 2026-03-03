import { NextRequest, NextResponse } from "next/server";

import { resolveGithubRepoUrl } from "../../../lib/plex";

export const dynamic = "force-dynamic";

const CASE_PR_TITLE_PREFIX = "CASE - Adding service :";

interface GitHubPullListItem {
  number: number;
  state: string;
  title: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  merged_at: string | null;
  draft: boolean;
  user: {
    login: string;
    type: string;
  } | null;
  head: {
    ref: string;
    sha: string;
  };
  base: {
    ref: string;
  };
}

interface HistoryItem {
  number: number;
  title: string;
  serviceName: string;
  htmlUrl: string;
  state: string;
  merged: boolean;
  draft: boolean;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  mergedAt: string | null;
  headRef: string;
  headSha: string;
  baseRef: string;
  author: string;
}

interface CaseHistoryResponse {
  sourceRepo: string;
  titlePrefix: string;
  serviceFilter: string | null;
  count: number;
  items: HistoryItem[];
}

function normalizeValue(value: string): string {
  return value.trim().toLowerCase();
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

function extractServiceName(title: string): string {
  if (!title.startsWith(CASE_PR_TITLE_PREFIX)) {
    return "";
  }
  return title.slice(CASE_PR_TITLE_PREFIX.length).trim();
}

function isCaseUiPullRequest(pr: GitHubPullListItem): boolean {
  if (!pr.title.startsWith(CASE_PR_TITLE_PREFIX)) {
    return false;
  }
  if (!pr.head.ref.startsWith("case/")) {
    return false;
  }
  return true;
}

function toHistoryItem(pr: GitHubPullListItem): HistoryItem {
  return {
    number: pr.number,
    title: pr.title,
    serviceName: extractServiceName(pr.title),
    htmlUrl: pr.html_url,
    state: pr.state,
    merged: Boolean(pr.merged_at),
    draft: pr.draft,
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
    closedAt: pr.closed_at,
    mergedAt: pr.merged_at,
    headRef: pr.head.ref,
    headSha: pr.head.sha,
    baseRef: pr.base.ref,
    author: pr.user?.login ?? "unknown"
  };
}

export async function GET(request: NextRequest) {
  const repoUrl = resolveGithubRepoUrl();
  const coordinates = parseGithubRepoCoordinates(repoUrl);
  if (!coordinates) {
    return NextResponse.json({ detail: "unable to resolve GitHub owner/repo from CASE_GITHUB_REPO_URL" }, { status: 500 });
  }

  const rawLimit = request.nextUrl.searchParams.get("limit") || "";
  const parsedLimit = Number.parseInt(rawLimit, 10);
  const limit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 200) : 50;
  const rawServiceFilter = request.nextUrl.searchParams.get("service") || "";
  const serviceFilter = rawServiceFilter.trim();
  const normalizedServiceFilter = normalizeValue(serviceFilter);

  const token = process.env.CASE_GITHUB_TOKEN || process.env.GITHUB_TOKEN || process.env.CASE_AUTOMERGE_TOKEN || "";

  try {
    const filtered: HistoryItem[] = [];
    const pagesToScan = 3;
    const pageSize = 100;
    for (let page = 1; page <= pagesToScan; page += 1) {
      const pulls = await githubGet<GitHubPullListItem[]>(
        `/repos/${encodeURIComponent(coordinates.owner)}/${encodeURIComponent(coordinates.repo)}/pulls?state=all&sort=created&direction=desc&per_page=${pageSize}&page=${page}`,
        token
      );
      if (pulls.length === 0) {
        break;
      }

      for (const pr of pulls) {
        if (!isCaseUiPullRequest(pr)) {
          continue;
        }
        const item = toHistoryItem(pr);
        if (normalizedServiceFilter && normalizeValue(item.serviceName) !== normalizedServiceFilter) {
          continue;
        }
        filtered.push(item);
        if (filtered.length >= limit) {
          break;
        }
      }

      if (filtered.length >= limit) {
        break;
      }
    }

    const response: CaseHistoryResponse = {
      sourceRepo: `${coordinates.owner}/${coordinates.repo}`,
      titlePrefix: CASE_PR_TITLE_PREFIX,
      serviceFilter: serviceFilter || null,
      count: filtered.length,
      items: filtered
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ detail: `unable to load CASE PR history: ${detail}` }, { status: 502 });
  }
}
