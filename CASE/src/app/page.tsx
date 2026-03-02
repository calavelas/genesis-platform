export const dynamic = "force-dynamic";
export const revalidate = 0;

import { ArgoEmbedPanel } from "./components/argo-embed-panel";

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
const FALLBACK_EMBED_URL = "https://127.0.0.1:18443/applications";

function normalizeApiBase(base: string): string {
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

function resolveApiBase(): string {
  const base = process.env.ENDR_API_URL || process.env.NEXT_PUBLIC_ENDR_API_URL || FALLBACK_API;
  return normalizeApiBase(base);
}

function resolveArgoEmbedUrl(): string {
  const value = process.env.CASE_ARGOCD_EMBED_URL || process.env.NEXT_PUBLIC_ARGOCD_EMBED_URL || FALLBACK_EMBED_URL;
  return value.trim() || FALLBACK_EMBED_URL;
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
  if (value === "progressing" || value === "unknown") {
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
  if (value === "progressing" || value === "unknown") {
    return "warn";
  }
  return "neutral";
}

function dataSourceTone(source: string): NodeTone {
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

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function optionalTimestamp(value: string | null): string {
  if (!value) {
    return "n/a";
  }
  return formatTimestamp(value);
}

function shortRevision(revision: string): string {
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

function sortByName(nodes: PlexNode[]): PlexNode[] {
  return [...nodes].sort((left, right) => left.name.localeCompare(right.name));
}

function hasAttention(node: PlexNode): boolean {
  return syncTone(node.syncStatus) === "bad" || healthTone(node.healthStatus) === "bad";
}

export default async function HomePage() {
  const { universe, endpoint } = await loadUniverse();
  const embedUrl = resolveArgoEmbedUrl();

  const coreApps = sortByName(universe.coreApps);
  const serviceApps = sortByName(universe.services);
  const deploymentApps = sortByName([...coreApps, ...serviceApps]);

  const totalServices = serviceApps.length;
  const healthyServices = serviceApps.filter((service) => healthTone(service.healthStatus) === "good").length;
  const syncedDeployments = deploymentApps.filter((app) => syncTone(app.syncStatus) === "good").length;
  const attentionCount = deploymentApps.filter(hasAttention).length;

  return (
    <main className="portal-shell">
      <header className="portal-topbar">
        <div className="topbar-brand">
          <span className="brand-dot" />
          <strong>CASE</strong>
          <span>Platform View</span>
        </div>

        <div className="topbar-status">
          <span className={`chip tone-${dataSourceTone(universe.dataSource)}`}>{universe.dataSource}</span>
          <span className="chip muted">Updated {formatTimestamp(universe.generatedAt)}</span>
        </div>
      </header>

      <div className="portal-layout">
        <aside className="portal-sidebar">
          <section className="sidebar-block">
            <h2>Navigation</h2>
            <ul>
              <li className="active">Dashboard</li>
              <li>Services</li>
              <li>Deployments</li>
              <li>ArgoCD Embed</li>
            </ul>
          </section>

          <section className="sidebar-block">
            <h2>Overview</h2>
            <dl>
              <div>
                <dt>Services</dt>
                <dd>{totalServices}</dd>
              </div>
              <div>
                <dt>Healthy</dt>
                <dd>{healthyServices}</dd>
              </div>
              <div>
                <dt>Synced</dt>
                <dd>{syncedDeployments}</dd>
              </div>
              <div>
                <dt>Attention</dt>
                <dd>{attentionCount}</dd>
              </div>
            </dl>
          </section>
        </aside>

        <section className="portal-main">
          <section className="hero-row">
            <div>
              <p className="eyebrow">Read-only Operations</p>
              <h1>Service and Deployment Health</h1>
              <p className="hero-subtitle">Dark mode dashboard with live ArgoCD embed for operational tracking.</p>
            </div>
            <a className="open-link" href={embedUrl} target="_blank" rel="noreferrer">
              Open ArgoCD
            </a>
          </section>

          <section className="metric-row" aria-label="health-overview">
            <article className="metric-card">
              <span>Services</span>
              <strong>{totalServices}</strong>
            </article>
            <article className="metric-card">
              <span>Healthy</span>
              <strong>{healthyServices}</strong>
            </article>
            <article className="metric-card">
              <span>Synced</span>
              <strong>{syncedDeployments}</strong>
            </article>
            <article className="metric-card">
              <span>Needs Attention</span>
              <strong className={attentionCount > 0 ? "tone-bad" : "tone-good"}>{attentionCount}</strong>
            </article>
          </section>

          {universe.warnings.length > 0 && (
            <section className="warning-box" aria-live="polite">
              <h2>Warnings</h2>
              <ul>
                {universe.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </section>
          )}

          <ArgoEmbedPanel embedUrl={embedUrl} />

          <section className="list-grid">
            <article className="panel">
              <h2>Service Health</h2>
              <ul className="status-list">
                {serviceApps.map((service) => (
                  <li key={`service-${service.name}`}>
                    <div>
                      <strong>{service.name}</strong>
                      <small>{service.namespace}</small>
                    </div>
                    <div className="status-meta">
                      <span className={`status-pill tone-${healthTone(service.healthStatus)}`}>{service.healthStatus}</span>
                      <code>{service.imageTag ?? "n/a"}</code>
                    </div>
                  </li>
                ))}

                {serviceApps.length === 0 && <li className="empty">No services found.</li>}
              </ul>
            </article>

            <article className="panel">
              <h2>Deployment Health</h2>
              <ul className="status-list">
                {deploymentApps.map((app) => (
                  <li key={`deploy-${app.kind}-${app.name}`}>
                    <div>
                      <strong>{app.name}</strong>
                      <small>{app.kind}</small>
                    </div>
                    <div className="status-meta">
                      <span className={`status-pill tone-${syncTone(app.syncStatus)}`}>{app.syncStatus}</span>
                      <code>{shortRevision(app.revision)}</code>
                      <small>{optionalTimestamp(app.deployedAt)}</small>
                    </div>
                  </li>
                ))}
              </ul>
            </article>
          </section>
        </section>
      </div>
    </main>
  );
}
