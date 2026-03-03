export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";

import { ArgoEmbedPanel } from "./components/argo-embed-panel";
import { PortalFrame } from "./components/portal-frame";
import {
  hasAttention,
  healthTone,
  loadUniverse,
  optionalTimestamp,
  resolveArgoEmbedUrl,
  shortRevision,
  sortByName,
  syncTone
} from "./lib/plex";

export default async function HomePage() {
  const universe = await loadUniverse();
  const embedUrl = resolveArgoEmbedUrl();

  const coreApps = sortByName(universe.coreApps);
  const serviceApps = sortByName(universe.services);
  const deploymentApps = sortByName([...coreApps, ...serviceApps]);

  const totalServices = serviceApps.length;
  const healthyServices = serviceApps.filter((service) => healthTone(service.healthStatus) === "good").length;
  const syncedDeployments = deploymentApps.filter((app) => syncTone(app.syncStatus) === "good").length;
  const attentionCount = deploymentApps.filter(hasAttention).length;

  return (
    <PortalFrame universe={universe}>
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
                    <Link
                      className="entity-link"
                      href={`/services/${encodeURIComponent(service.name)}`}
                      title={`Open ${service.name} service page`}
                    >
                      <strong>{service.name}</strong>
                    </Link>
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
    </PortalFrame>
  );
}
