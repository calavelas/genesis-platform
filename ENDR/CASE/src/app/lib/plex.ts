type NodeKind = "core" | "service";

export type NodeTone = "good" | "warn" | "bad" | "neutral";

export interface PlexNode {
  name: string;
  kind: NodeKind;
  namespace: string;
  syncStatus: string;
  healthStatus: string;
  sourcePath: string;
  revision: string;
  deployedAt: string | null;
  imageTag: string | null;
  templateName?: string | null;
  gatewayEnabled?: boolean | null;
  serviceUrl?: string | null;
  orbitBand: number;
}

export interface PlexUniverse {
  generatedAt: string;
  dataSource: string;
  galaxyName: string;
  clusterPath: string;
  servicesPath: string;
  warnings: string[];
  coreApps: PlexNode[];
  services: PlexNode[];
}

const FALLBACK_API = "http://127.0.0.1:8000";
const FALLBACK_EMBED_URL = "https://argocd.calavelas.net/applications";
const FALLBACK_GITHUB_REPO_URL = "https://github.com/calavelas/ENDR";
const FALLBACK_GITHUB_BRANCH = "main";
const FALLBACK_API_TIMEOUT_MS = 5000;

function encodePathSegments(value: string): string {
  return value
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function normalizeApiBase(base: string): string {
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

export function resolveApiBase(): string {
  const base = process.env.ENDR_API_URL || process.env.NEXT_PUBLIC_ENDR_API_URL || FALLBACK_API;
  return normalizeApiBase(base);
}

function resolveApiTimeoutMs(): number {
  const configured = Number(process.env.CASE_PLEX_FETCH_TIMEOUT_MS || process.env.NEXT_PUBLIC_CASE_PLEX_FETCH_TIMEOUT_MS);
  if (Number.isFinite(configured) && configured >= 500) {
    return Math.round(configured);
  }
  return FALLBACK_API_TIMEOUT_MS;
}

async function fetchJsonWithTimeout<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = resolveApiTimeoutMs();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function resolveArgoEmbedUrl(): string {
  const value =
    process.env.CASE_ARGOCD_EMBED_URL ||
    process.env.NEXT_PUBLIC_CASE_ARGOCD_EMBED_URL ||
    process.env.NEXT_PUBLIC_ARGOCD_EMBED_URL ||
    FALLBACK_EMBED_URL;
  return value.trim() || FALLBACK_EMBED_URL;
}

export function resolveGithubRepoUrl(): string {
  const value =
    process.env.CASE_GITHUB_REPO_URL || process.env.NEXT_PUBLIC_CASE_GITHUB_REPO_URL || process.env.NEXT_PUBLIC_GITHUB_REPO_URL;
  return value?.trim() || FALLBACK_GITHUB_REPO_URL;
}

export function resolveGithubBranch(): string {
  const value = process.env.CASE_GITHUB_BRANCH || process.env.NEXT_PUBLIC_CASE_GITHUB_BRANCH;
  return value?.trim() || FALLBACK_GITHUB_BRANCH;
}

export function buildArgoApplicationUrl(embedUrl: string, appName: string): string {
  const name = appName.trim();
  if (!name) {
    return embedUrl;
  }

  try {
    const parsed = new URL(embedUrl);
    parsed.pathname = `/applications/argocd/${encodeURIComponent(name)}`;
    parsed.search = "resource=";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    const trimmed = embedUrl.trim().replace(/\/+$/, "");
    const base = trimmed.includes("/applications") ? trimmed.replace(/\/applications.*$/, "/applications") : `${trimmed}/applications`;
    return `${base}/argocd/${encodeURIComponent(name)}?resource=`;
  }
}

export function buildServiceFolderPath(serviceName: string): string {
  return `SVCS/${serviceName.trim()}`;
}

export function buildGithubFolderUrl(repoUrl: string, branch: string, folderPath: string): string {
  const cleanedRepo = repoUrl.trim().replace(/\/+$/, "");
  const cleanedBranch = branch.trim() || FALLBACK_GITHUB_BRANCH;
  const cleanedPath = folderPath.trim().replace(/^\/+/, "");

  return `${cleanedRepo}/tree/${encodePathSegments(cleanedBranch)}/${encodePathSegments(cleanedPath)}`;
}

export function buildGithubFileUrl(repoUrl: string, branch: string, filePath: string): string {
  const cleanedRepo = repoUrl.trim().replace(/\/+$/, "");
  const cleanedBranch = branch.trim() || FALLBACK_GITHUB_BRANCH;
  const cleanedPath = filePath.trim().replace(/^\/+/, "");

  return `${cleanedRepo}/blob/${encodePathSegments(cleanedBranch)}/${encodePathSegments(cleanedPath)}`;
}

export function buildGithubRawFileUrl(repoUrl: string, branch: string, filePath: string): string {
  const cleanedBranch = branch.trim() || FALLBACK_GITHUB_BRANCH;
  const cleanedPath = filePath.trim().replace(/^\/+/, "");

  try {
    const parsed = new URL(repoUrl.trim());
    if (parsed.hostname === "github.com") {
      const parts = parsed.pathname.split("/").filter((part) => part.length > 0);
      if (parts.length >= 2) {
        const owner = encodeURIComponent(parts[0]);
        const repo = encodeURIComponent(parts[1].replace(/\.git$/, ""));
        return `https://raw.githubusercontent.com/${owner}/${repo}/${encodePathSegments(cleanedBranch)}/${encodePathSegments(cleanedPath)}`;
      }
    }
  } catch {
    // Fallback to blob URL if repository URL parsing fails.
  }

  return buildGithubFileUrl(repoUrl, cleanedBranch, cleanedPath);
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function syncTone(status: string): NodeTone {
  const value = normalize(status);
  if (value === "synced") {
    return "good";
  }
  if (value === "outofsync" || value === "missing") {
    return "bad";
  }
  if (value === "progressing" || value === "unknown") {
    return "warn";
  }
  return "neutral";
}

export function healthTone(status: string): NodeTone {
  const value = normalize(status);
  if (value === "healthy") {
    return "good";
  }
  if (value === "degraded" || value === "suspended" || value === "missing") {
    return "bad";
  }
  if (value === "progressing" || value === "unknown") {
    return "warn";
  }
  return "neutral";
}

export function dataSourceTone(source: string): NodeTone {
  const value = normalize(source);
  if (value === "argocd") {
    return "good";
  }
  if (value === "config") {
    return "warn";
  }
  if (value === "fallback") {
    return "bad";
  }
  return "neutral";
}

export function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

export function optionalTimestamp(value: string | null): string {
  if (!value) {
    return "n/a";
  }
  return formatTimestamp(value);
}

export function shortRevision(revision: string): string {
  const value = revision.trim();
  if (!value) {
    return "n/a";
  }
  if (/^[a-f0-9]{12,}$/i.test(value)) {
    return value.slice(0, 12);
  }
  return value;
}

function buildFallbackUniverse(reason: string): PlexUniverse {
  return {
    generatedAt: new Date().toISOString(),
    dataSource: "fallback",
    galaxyName: "lab",
    clusterPath: "KUBE/clusters/mac/lab/core",
    servicesPath: "KUBE/clusters/mac/lab/services",
    warnings: [reason],
    coreApps: [
      {
        name: "lab",
        kind: "core",
        namespace: "argocd",
        syncStatus: "Unknown",
        healthStatus: "Unknown",
        sourcePath: "KUBE/clusters/mac/lab/core.yaml",
        revision: "main",
        deployedAt: null,
        imageTag: null,
        templateName: "Platform",
        gatewayEnabled: false,
        serviceUrl: null,
        orbitBand: 0
      }
    ],
    services: []
  };
}

export async function loadUniverse(): Promise<PlexUniverse> {
  const apiBase = resolveApiBase();
  const endpoint = `${apiBase}/api/plex`;

  try {
    return await fetchJsonWithTimeout<PlexUniverse>(endpoint);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    return buildFallbackUniverse(`Unable to reach ENDR API at ${endpoint}: ${reason}`);
  }
}

export function sortByName(nodes: PlexNode[]): PlexNode[] {
  return [...nodes].sort((left, right) => left.name.localeCompare(right.name));
}

export function hasAttention(node: PlexNode): boolean {
  return syncTone(node.syncStatus) === "bad" || healthTone(node.healthStatus) === "bad";
}

export function findServiceByName(services: PlexNode[], name: string): PlexNode | undefined {
  const expected = normalize(name);
  return services.find((service) => normalize(service.name) === expected);
}

export function findCoreAppByName(coreApps: PlexNode[], name: string): PlexNode | undefined {
  const expected = normalize(name);
  return coreApps.find((app) => normalize(app.name) === expected);
}
