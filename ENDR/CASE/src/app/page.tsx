export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";

import { ArgoEmbedPanel } from "./components/argo-embed-panel";
import { PortalFrame } from "./components/portal-frame";
import {
  healthTone,
  loadUniverse,
  resolveArgoEmbedUrl,
  resolveGithubRepoUrl,
  sortByName,
  syncTone
} from "./lib/plex";

export default async function HomePage() {
  const universe = await loadUniverse();
  const embedUrl = resolveArgoEmbedUrl();
  const githubRepoUrl = resolveGithubRepoUrl();

  const coreApps = sortByName(universe.coreApps);
  const serviceApps = sortByName(universe.services);
  const platformApps = sortByName(coreApps);

  return (
    <PortalFrame universe={universe}>
      <section className="portal-main">
        <section className="hero-row platform-home-hero">
          <div className="platform-home-main">
            <h1 className="hero-landing-title">
              <span className="hero-landing-brand">ENDR</span>
              <span className="hero-landing-divider">|</span>
              <span className="hero-landing-purpose">Internal Developer Platform</span>
            </h1>
            <p className="hero-landing-tagline">&ldquo;Damn&hellip; I should have used Backstage&rdquo;</p>
            <p className="hero-landing-copy">
              ENDR is an Internal Developer Platform demo built with OpenAI Codex. Powered by Next.js, GitHub, and ArgoCD, it provides a service catalog, application management, and platform insights.
            </p>
            <figure className="hero-landing-quote">
              <blockquote>&ldquo;Because manually deploying YAML at 2&nbsp;a.m. shouldn&rsquo;t be part of the developer experience.&rdquo;</blockquote>
              <figcaption>&mdash; ChatGPT, 2026</figcaption>
            </figure>
            <div className="hero-actions hero-actions-landing">
              <Link className="open-link hero-cta-primary" href="/create">
                Try Create Service!
              </Link>
              <a className="open-link hero-cta-secondary" href={githubRepoUrl} target="_blank" rel="noreferrer">
                View Source on GitHub
              </a>
            </div>
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

        <section className="home-tables-grid" aria-label="service-catalog-track">
          <article className="home-table-column">
            <section className="panel section-header-panel" aria-label="application-services-header">
              <div className="service-lane-header">
                <h2 className="section-header-brand">Application Services</h2>
                <span className="chip muted">{serviceApps.length}</span>
              </div>
            </section>

            <section className="panel service-table-wrap home-service-table-wrap" aria-label="application-services-table">
              <table className="service-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Namespace</th>
                    <th>Kind</th>
                    <th>Health</th>
                    <th>Sync</th>
                    <th>Gateway</th>
                    <th>Image</th>
                  </tr>
                </thead>
                <tbody>
                  {serviceApps.map((service) => {
                    const gatewayEnabled = service.gatewayEnabled === true;
                    const serviceUrl = service.serviceUrl?.trim() || `https://${service.name}.calavelas.net`;
                    return (
                      <tr key={service.name}>
                        <td>
                          <Link className="entity-link" href={`/application-services/${encodeURIComponent(service.name)}`}>
                            {service.name}
                          </Link>
                        </td>
                        <td>{service.namespace}</td>
                        <td>{service.templateName?.trim() || "n/a"}</td>
                        <td>
                          <span className={`status-pill tone-${healthTone(service.healthStatus)}`}>{service.healthStatus}</span>
                        </td>
                        <td>
                          <span className={`status-pill tone-${syncTone(service.syncStatus)}`}>{service.syncStatus}</span>
                        </td>
                        <td>
                          {gatewayEnabled ? (
                            <a className="entity-link" href={serviceUrl} target="_blank" rel="noreferrer">
                              True
                            </a>
                          ) : (
                            "False"
                          )}
                        </td>
                        <td>
                          <code>{service.imageTag ?? "n/a"}</code>
                        </td>
                      </tr>
                    );
                  })}
                  {serviceApps.length === 0 && (
                    <tr>
                      <td colSpan={7} className="empty-cell">
                        No application services found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>
          </article>

          <article className="home-table-column">
            <section className="panel section-header-panel" aria-label="platform-services-header">
              <div className="service-lane-header">
                <h2 className="section-header-brand">Platform Services</h2>
                <span className="chip muted">{platformApps.length}</span>
              </div>
            </section>

            <section className="panel service-table-wrap home-service-table-wrap" aria-label="platform-services-table">
              <table className="service-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Namespace</th>
                    <th>Kind</th>
                    <th>Health</th>
                    <th>Sync</th>
                    <th>Gateway</th>
                    <th>Image</th>
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
                      <td>{app.namespace}</td>
                      <td>Platform</td>
                      <td>
                        <span className={`status-pill tone-${healthTone(app.healthStatus)}`}>{app.healthStatus}</span>
                      </td>
                      <td>
                        <span className={`status-pill tone-${syncTone(app.syncStatus)}`}>{app.syncStatus}</span>
                      </td>
                      <td>False</td>
                      <td>
                        <code>{app.imageTag ?? "n/a"}</code>
                      </td>
                    </tr>
                  ))}
                  {platformApps.length === 0 && (
                    <tr>
                      <td colSpan={7} className="empty-cell">
                        No platform services found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>
          </article>
        </section>

        <section className="panel section-header-panel" aria-label="argocd-dashboard-header">
          <h2 className="section-header-brand">ArgoCD Dashboard</h2>
        </section>

        <ArgoEmbedPanel embedUrl={embedUrl} showHeader={false} />
      </section>
    </PortalFrame>
  );
}
