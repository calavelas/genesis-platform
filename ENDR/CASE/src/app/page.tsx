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
            <p className="eyebrow">Internal Developer Platform</p>
            <h1 className="hero-title">
              <span className="hero-title-name">ENDR</span>
              <span className="hero-title-separator">|</span>
              <span className="hero-title-purpose">Internal Developer Platform</span>
            </h1>
             <p className="hero-subtitle hero-story-copy">
              "I should have you Backstage instead of Vibe coding these"
            </p>
            <p className="hero-subtitle hero-story-copy">
              A Platform Engineering demo showing GitOps-driven IDP capabilities <br />
              built with OpenAI Codex utilizing GitHub and ArgoCD.
            </p>  
            <p className="hero-subtitle hero-intro-copy">This platform demonstrates:</p>
            <ul className="hero-feature-list hero-story-list">
              <li>
                <strong>GitHub as source of truth</strong>.
              </li>
              <li>
                <strong>GitHub Actions</strong> for reconciliation, generation, build, and deploy workflow.
              </li>
              <li>
                <strong>ArgoCD GitOps operations</strong> to sync app-of-apps into Kubernetes.
              </li>
            </ul>
            <div className="hero-actions">
              <Link className="open-link" href="/create">
                + Create New Service
              </Link>
              <a className="open-link" href={embedUrl} target="_blank" rel="noreferrer">
                ArgoCD
              </a>
              <a className="open-link" href={githubRepoUrl} target="_blank" rel="noreferrer">
                GitHub
              </a>
            </div>
          </div>

          <aside className="panel platform-flow-panel" aria-label="delivery-flow">
            <h2 className="section-header-brand">Delivery Flow</h2>
            <div className="flow-steps-vertical">
              <div className="flow-step">
                <span className="flow-step-num">1</span>
                <strong>CASE</strong>
                <span className="flow-step-desc">Create service &amp; open PR</span>
              </div>
              <span className="flow-arrow-down">↓</span>
              <div className="flow-step">
                <span className="flow-step-num">2</span>
                <strong>GitHub</strong>
                <span className="flow-step-desc">Source of truth</span>
              </div>
              <span className="flow-arrow-down">↓</span>
              <div className="flow-step">
                <span className="flow-step-num">3</span>
                <strong>TARS</strong>
                <span className="flow-step-desc">Reconcile &amp; generate</span>
              </div>
              <span className="flow-arrow-down">↓</span>
              <div className="flow-step">
                <span className="flow-step-num">4</span>
                <strong>ArgoCD</strong>
                <span className="flow-step-desc">GitOps sync</span>
              </div>
              <span className="flow-arrow-down">↓</span>
              <div className="flow-step">
                <span className="flow-step-num">5</span>
                <strong>k3d</strong>
                <span className="flow-step-desc">Runtime cluster</span>
              </div>
            </div>
          </aside>
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
