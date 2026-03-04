export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";

import { PortalFrame } from "../components/portal-frame";
import {
  buildArgoApplicationUrl,
  buildGithubFolderUrl,
  buildServiceFolderPath,
  healthTone,
  loadUniverse,
  optionalTimestamp,
  resolveArgoEmbedUrl,
  resolveGithubBranch,
  resolveGithubRepoUrl,
  shortRevision,
  sortByName,
  syncTone
} from "../lib/plex";

export default async function CatalogPage() {
  const universe = await loadUniverse();
  const embedUrl = resolveArgoEmbedUrl();
  const githubRepoUrl = resolveGithubRepoUrl();
  const githubBranch = resolveGithubBranch();
  const applicationServices = sortByName(universe.services);
  const platformServices = sortByName(universe.coreApps);

  return (
    <PortalFrame universe={universe}>
      <section className="portal-main">
        <section className="hero-row">
          <div>
            <p className="eyebrow">Catalog</p>
            <h1>Service Catalog</h1>
            <p className="hero-subtitle">Unified catalog for application services and platform services.</p>
          </div>
          <div className="hero-actions">
            <Link className="open-link" href="/create">
              Create Service
            </Link>
            <a className="open-link" href={embedUrl} target="_blank" rel="noreferrer">
              Open ArgoCD
            </a>
          </div>
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

        <section className="panel section-header-panel" aria-label="application-services-header">
          <h2 className="section-header-brand">Application Services</h2>
        </section>

        <section className="panel service-table-wrap" aria-label="application-services-table">
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
              {applicationServices.map((service) => (
                <tr key={service.name}>
                  <td>
                    <Link className="entity-link" href={`/application-services/${encodeURIComponent(service.name)}`}>
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
              {applicationServices.length === 0 && (
                <tr>
                  <td colSpan={10} className="empty-cell">
                    No application services found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="panel section-header-panel" aria-label="platform-services-header">
          <h2 className="section-header-brand">Platform Services</h2>
        </section>

        <section className="panel service-table-wrap" aria-label="platform-services-table">
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
              {platformServices.map((app) => (
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
              {platformServices.length === 0 && (
                <tr>
                  <td colSpan={10} className="empty-cell">
                    No platform services found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </section>
    </PortalFrame>
  );
}
