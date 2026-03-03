export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";

import { ArgoEmbedPanel } from "./components/argo-embed-panel";
import { PortalFrame } from "./components/portal-frame";
import {
  buildArgoApplicationUrl,
  buildGithubFolderUrl,
  buildServiceFolderPath,
  hasAttention,
  healthTone,
  loadUniverse,
  optionalTimestamp,
  resolveArgoEmbedUrl,
  resolveGithubBranch,
  resolveGithubRepoUrl,
  shortRevision,
  sortByName,
  syncTone
} from "./lib/plex";

export default async function HomePage() {
  const universe = await loadUniverse();
  const embedUrl = resolveArgoEmbedUrl();
  const githubRepoUrl = resolveGithubRepoUrl();
  const githubBranch = resolveGithubBranch();

  const coreApps = sortByName(universe.coreApps);
  const serviceApps = sortByName(universe.services);
  const platformApps = sortByName(coreApps);
  const deploymentApps = sortByName([...coreApps, ...serviceApps]);

  const totalServices = serviceApps.length;
  const totalPlatformServices = platformApps.length;
  const syncedDeployments = deploymentApps.filter((app) => syncTone(app.syncStatus) === "good").length;
  const attentionCount = deploymentApps.filter(hasAttention).length;

  return (
    <PortalFrame universe={universe}>
      <section className="portal-main">
        <section className="hero-row">
          <div>
            <p className="eyebrow">Read-only Operations</p>
            <h1>Platform Overview</h1>
            <p className="hero-subtitle">
              Unified read-only view for application services, platform services, sync/health status, and direct GitOps links.
            </p>
          </div>
          <div className="hero-actions">
            <a className="open-link" href={embedUrl} target="_blank" rel="noreferrer">
              Open ArgoCD
            </a>
            <a className="open-link" href={githubRepoUrl} target="_blank" rel="noreferrer">
              Open GitHub
            </a>
          </div>
        </section>

        <section className="metric-row" aria-label="health-overview">
          <article className="metric-card">
            <span>Application Services</span>
            <strong>{totalServices}</strong>
          </article>
          <article className="metric-card">
            <span>Platform Services</span>
            <strong>{totalPlatformServices}</strong>
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

        <section className="panel section-header-panel" aria-label="services-header">
          <h2>Application Services</h2>
        </section>

        <section className="panel service-table-wrap" aria-label="services-table">
          <table className="service-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Kind</th>
                <th>Namespace</th>
                <th>Health</th>
                <th>Sync</th>
                <th>Image</th>
                <th>Revision</th>
                <th>Updated</th>
                <th>ArgoCD</th>
                <th>GitHub</th>
              </tr>
            </thead>
            <tbody>
              {serviceApps.map((service) => (
                <tr key={service.name}>
                  <td>
                    <Link className="entity-link" href={`/services/${encodeURIComponent(service.name)}`}>
                      {service.name}
                    </Link>
                  </td>
                  <td>
                    <span className="catalog-kind">application services</span>
                  </td>
                  <td>{service.namespace}</td>
                  <td>
                    <span className={`status-pill tone-${healthTone(service.healthStatus)}`}>{service.healthStatus}</span>
                  </td>
                  <td>
                    <span className={`status-pill tone-${syncTone(service.syncStatus)}`}>{service.syncStatus}</span>
                  </td>
                  <td>
                    <code>{service.imageTag ?? "n/a"}</code>
                  </td>
                  <td>
                    <code>{shortRevision(service.revision)}</code>
                  </td>
                  <td>{optionalTimestamp(service.deployedAt)}</td>
                  <td>
                    <a
                      className="open-link compact"
                      href={buildArgoApplicationUrl(embedUrl, service.name)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open
                    </a>
                  </td>
                  <td>
                    <a
                      className="entity-link"
                      href={buildGithubFolderUrl(githubRepoUrl, githubBranch, buildServiceFolderPath(service.name))}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Folder
                    </a>
                  </td>
                </tr>
              ))}

              {serviceApps.length === 0 && (
                <tr>
                  <td colSpan={10} className="empty-cell">
                    No application services found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="panel section-header-panel" aria-label="platform-apps-header">
          <h2>Platform Services</h2>
        </section>

        <section className="panel service-table-wrap" aria-label="platform-apps-table">
          <table className="service-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Kind</th>
                <th>Namespace</th>
                <th>Health</th>
                <th>Sync</th>
                <th>Image</th>
                <th>Revision</th>
                <th>Updated</th>
                <th>ArgoCD</th>
                <th>GitHub</th>
              </tr>
            </thead>
            <tbody>
              {platformApps.map((app) => (
                <tr key={app.name}>
                  <td>
                    <Link className="entity-link" href={`/platform-services/${encodeURIComponent(app.name)}`}>
                      {app.name}
                    </Link>
                  </td>
                  <td>
                    <span className="catalog-kind">platform service</span>
                  </td>
                  <td>{app.namespace}</td>
                  <td>
                    <span className={`status-pill tone-${healthTone(app.healthStatus)}`}>{app.healthStatus}</span>
                  </td>
                  <td>
                    <span className={`status-pill tone-${syncTone(app.syncStatus)}`}>{app.syncStatus}</span>
                  </td>
                  <td>
                    <code>{app.imageTag ?? "n/a"}</code>
                  </td>
                  <td>
                    <code>{shortRevision(app.revision)}</code>
                  </td>
                  <td>{optionalTimestamp(app.deployedAt)}</td>
                  <td>
                    <a
                      className="open-link compact"
                      href={buildArgoApplicationUrl(embedUrl, app.name)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open
                    </a>
                  </td>
                  <td>
                    {app.sourcePath ? (
                      <a
                        className="entity-link"
                        href={buildGithubFolderUrl(githubRepoUrl, githubBranch, app.sourcePath)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Folder
                      </a>
                    ) : (
                      <span className="empty-cell">n/a</span>
                    )}
                  </td>
                </tr>
              ))}

              {platformApps.length === 0 && (
                <tr>
                  <td colSpan={10} className="empty-cell">
                    No platform services found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <ArgoEmbedPanel embedUrl={embedUrl} />
      </section>
    </PortalFrame>
  );
}
