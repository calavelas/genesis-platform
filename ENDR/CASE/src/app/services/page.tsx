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
  resolveGithubBranch,
  resolveGithubRepoUrl,
  resolveArgoEmbedUrl,
  shortRevision,
  sortByName,
  syncTone
} from "../lib/plex";

export default async function ServicesPage() {
  const universe = await loadUniverse();
  const embedUrl = resolveArgoEmbedUrl();
  const githubRepoUrl = resolveGithubRepoUrl();
  const githubBranch = resolveGithubBranch();
  const services = sortByName(universe.services);

  return (
    <PortalFrame universe={universe}>
      <section className="portal-main">
        <section className="hero-row">
          <div>
            <p className="eyebrow">Catalog</p>
            <h1>Services</h1>
            <p className="hero-subtitle">Component-style catalog table with drill-down into each service.</p>
          </div>
          <Link className="open-link" href="/services/new">
            Create Service
          </Link>
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
              {services.map((service) => (
                <tr key={service.name}>
                  <td>
                    <Link className="entity-link" href={`/services/${encodeURIComponent(service.name)}`}>
                      {service.name}
                    </Link>
                  </td>
                  <td>
                    <span className="catalog-kind">component</span>
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

              {services.length === 0 && (
                <tr>
                  <td colSpan={10} className="empty-cell">
                    No services found.
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
