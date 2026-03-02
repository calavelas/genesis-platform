export const dynamic = "force-dynamic";
export const revalidate = 0;

type NodeKind = "core" | "service";
type NodeTone = "good" | "warn" | "bad" | "neutral";

interface PlexNode {
  name: string;
  kind: NodeKind;
  namespace: string;
  syncStatus: string;
  healthStatus: string;
  sourcePath: string;
  revision: string;
  deployedAt: string | null;
  imageTag: string | null;
  orbitBand: number;
}

interface PlexUniverse {
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

function normalizeApiBase(base: string): string {
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

function resolveApiBase(): string {
  const base = process.env.ENDR_API_URL || process.env.NEXT_PUBLIC_ENDR_API_URL || FALLBACK_API;
  return normalizeApiBase(base);
}

function buildFallbackUniverse(reason: string): PlexUniverse {
  return {
    generatedAt: new Date().toISOString(),
    dataSource: "fallback",
    galaxyName: "gargantua",
    clusterPath: "KUBE/clusters/space/core",
    servicesPath: "KUBE/clusters/space/gargantua",
    warnings: [reason],
    coreApps: [
      {
        name: "gargantua",
        kind: "core",
        namespace: "argocd",
        syncStatus: "Unknown",
        healthStatus: "Unknown",
        sourcePath: "KUBE/clusters/space/core",
        revision: "main",
        deployedAt: null,
        imageTag: null,
        orbitBand: 0
      }
    ],
    services: []
  };
}

async function loadUniverse(): Promise<{ universe: PlexUniverse; endpoint: string }> {
  const apiBase = resolveApiBase();
  const endpoint = `${apiBase}/api/plex/universe`;

  try {
    const response = await fetch(endpoint, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const universe = (await response.json()) as PlexUniverse;
    return { universe, endpoint };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    return {
      universe: buildFallbackUniverse(`Unable to reach ENDR API at ${endpoint}: ${reason}`),
      endpoint
    };
  }
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function syncTone(status: string): NodeTone {
  const value = normalize(status);
  if (value === "synced") {
    return "good";
  }
  if (value === "outofsync" || value === "missing") {
    return "bad";
  }
  if (value === "unknown" || value === "progressing") {
    return "warn";
  }
  return "neutral";
}

function healthTone(status: string): NodeTone {
  const value = normalize(status);
  if (value === "healthy") {
    return "good";
  }
  if (value === "degraded" || value === "suspended" || value === "missing") {
    return "bad";
  }
  if (value === "unknown" || value === "progressing") {
    return "warn";
  }
  return "neutral";
}

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function formatOptionalTimestamp(value: string | null): string {
  if (!value) {
    return "n/a";
  }
  return formatTimestamp(value);
}

function shortRevision(value: string): string {
  const revision = value.trim();
  if (!revision) {
    return "n/a";
  }
  if (/^[a-f0-9]{12,}$/i.test(revision)) {
    return revision.slice(0, 12);
  }
  return revision;
}

function sortNodes(nodes: PlexNode[]): PlexNode[] {
  return [...nodes].sort((left, right) => left.name.localeCompare(right.name));
}

function statusCount(nodes: PlexNode[], key: "syncStatus" | "healthStatus", match: string): number {
  const lookup = match.toLowerCase();
  return nodes.filter((node) => normalize(node[key]) === lookup).length;
}

function isProblem(node: PlexNode): boolean {
  const sync = normalize(node.syncStatus);
  const health = normalize(node.healthStatus);
  return sync === "outofsync" || sync === "missing" || health === "degraded" || health === "missing";
}

export default async function HomePage() {
  const { universe, endpoint } = await loadUniverse();
  const coreApps = sortNodes(universe.coreApps);
  const serviceApps = sortNodes(universe.services);
  const allApps = [...coreApps, ...serviceApps];

  const appCount = allApps.length;
  const syncedCount = statusCount(allApps, "syncStatus", "synced");
  const healthyCount = statusCount(allApps, "healthStatus", "healthy");
  const problemCount = allApps.filter(isProblem).length;

  return (
    <main className="portal-page">
      <header className="portal-header">
        <div>
          <p className="portal-label">CASE</p>
          <h1>Applications</h1>
          <p className="portal-subtitle">ArgoCD-style read-only portal for ENDR</p>
        </div>
        <div className="header-meta">
          <span className="source-chip">{universe.dataSource}</span>
          <span>Updated {formatTimestamp(universe.generatedAt)}</span>
          <span className="endpoint-text">{endpoint}</span>
        </div>
      </header>

      <section className="summary-grid">
        <article className="summary-card">
          <h2>Total Apps</h2>
          <p>{appCount}</p>
          <small>{coreApps.length} core, {serviceApps.length} services</small>
        </article>
        <article className="summary-card">
          <h2>Synced</h2>
          <p>{syncedCount}</p>
          <small>{appCount - syncedCount} not synced</small>
        </article>
        <article className="summary-card">
          <h2>Healthy</h2>
          <p>{healthyCount}</p>
          <small>{appCount - healthyCount} not healthy</small>
        </article>
        <article className="summary-card">
          <h2>Warnings</h2>
          <p>{Math.max(problemCount, universe.warnings.length)}</p>
          <small>Operational signals</small>
        </article>
      </section>

      {universe.warnings.length > 0 && (
        <section className="warning-panel" aria-live="polite">
          <h2>Telemetry Warnings</h2>
          <ul>
            {universe.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel">
        <div className="panel-header">
          <h2>Core Applications</h2>
          <p>{universe.clusterPath}</p>
        </div>
        <div className="table-wrap">
          <table className="apps-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Namespace</th>
                <th>Sync</th>
                <th>Health</th>
                <th>Revision</th>
                <th>Deployed</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {coreApps.map((node) => (
                <tr key={`core-${node.name}`}>
                  <td>
                    <div className="app-name">{node.name}</div>
                    <div className="app-kind">core app</div>
                  </td>
                  <td className="mono">{node.namespace}</td>
                  <td>
                    <span className={`status-pill tone-${syncTone(node.syncStatus)}`}>{node.syncStatus}</span>
                  </td>
                  <td>
                    <span className={`status-pill tone-${healthTone(node.healthStatus)}`}>{node.healthStatus}</span>
                  </td>
                  <td className="mono">{shortRevision(node.revision)}</td>
                  <td>{formatOptionalTimestamp(node.deployedAt)}</td>
                  <td className="source-path">{node.sourcePath}</td>
                </tr>
              ))}
              {coreApps.length === 0 && (
                <tr>
                  <td className="empty-row" colSpan={7}>
                    No core applications found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Service Applications</h2>
          <p>{universe.servicesPath}</p>
        </div>
        <div className="table-wrap">
          <table className="apps-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Namespace</th>
                <th>Sync</th>
                <th>Health</th>
                <th>Revision</th>
                <th>Deployed</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {serviceApps.map((node) => (
                <tr key={`service-${node.name}`}>
                  <td>
                    <div className="app-name">{node.name}</div>
                    <div className="app-kind">{node.imageTag ? `tag: ${node.imageTag}` : "service app"}</div>
                  </td>
                  <td className="mono">{node.namespace}</td>
                  <td>
                    <span className={`status-pill tone-${syncTone(node.syncStatus)}`}>{node.syncStatus}</span>
                  </td>
                  <td>
                    <span className={`status-pill tone-${healthTone(node.healthStatus)}`}>{node.healthStatus}</span>
                  </td>
                  <td className="mono">{shortRevision(node.revision)}</td>
                  <td>{formatOptionalTimestamp(node.deployedAt)}</td>
                  <td className="source-path">{node.sourcePath}</td>
                </tr>
              ))}
              {serviceApps.length === 0 && (
                <tr>
                  <td className="empty-row" colSpan={7}>
                    No service applications found. Add services in `SVCS.yaml` and run reconcile.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="portal-footer">
        <span>Galaxy: {universe.galaxyName}</span>
        <span>Cluster path: {universe.clusterPath}</span>
        <span>Services path: {universe.servicesPath}</span>
      </footer>
    </main>
  );
}
