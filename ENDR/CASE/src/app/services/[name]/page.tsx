export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { notFound } from "next/navigation";

import { ArgoEmbedPanel } from "../../components/argo-embed-panel";
import { PortalFrame } from "../../components/portal-frame";
import {
  buildArgoApplicationUrl,
  buildGithubFolderUrl,
  buildServiceFolderPath,
  findServiceByName,
  healthTone,
  loadUniverse,
  optionalTimestamp,
  resolveArgoEmbedUrl,
  resolveGithubBranch,
  resolveGithubRepoUrl,
  shortRevision,
  syncTone
} from "../../lib/plex";

interface ServiceDetailPageProps {
  params: Promise<{
    name: string;
  }>;
}

export default async function ServiceDetailPage({ params }: ServiceDetailPageProps) {
  const { name } = await params;

  const universe = await loadUniverse();
  const serviceName = decodeURIComponent(name);
  const service = findServiceByName(universe.services, serviceName);

  if (!service) {
    notFound();
  }

  const embedUrl = resolveArgoEmbedUrl();
  const githubRepoUrl = resolveGithubRepoUrl();
  const githubBranch = resolveGithubBranch();
  const serviceArgoUrl = buildArgoApplicationUrl(embedUrl, service.name);
  const serviceFolder = buildServiceFolderPath(service.name);
  const serviceGithubUrl = buildGithubFolderUrl(githubRepoUrl, githubBranch, serviceFolder);
  const serviceAccessHost = `${service.name}.calavelas.net`;
  const serviceAccessUrl = `https://${serviceAccessHost}`;

  return (
    <PortalFrame universe={universe}>
      <section className="portal-main">
        <section className="hero-row">
          <div>
            <p className="eyebrow">Application Service Details</p>
            <h1>{service.name}</h1>
            <p className="hero-subtitle">Detailed service metadata and deployment posture.</p>
          </div>
          <a className="open-link" href={serviceArgoUrl} target="_blank" rel="noreferrer">
            Open In ArgoCD
          </a>
        </section>

        <section className="detail-grid" aria-label="service-details">
          <article className="panel detail-panel">
            <h2>Identity</h2>
            <dl className="kv-list">
              <div>
                <dt>Kind</dt>
                <dd>application services</dd>
              </div>
              <div>
                <dt>Name</dt>
                <dd>{service.name}</dd>
              </div>
              <div>
                <dt>Namespace</dt>
                <dd>{service.namespace}</dd>
              </div>
              <div>
                <dt>Access</dt>
                <dd>
                  <a className="entity-link" href={serviceAccessUrl} target="_blank" rel="noreferrer">
                    {serviceAccessHost}
                  </a>
                </dd>
              </div>
              <div>
                <dt>Source Path</dt>
                <dd>
                  <code>{service.sourcePath}</code>
                </dd>
              </div>
              <div>
                <dt>Service Folder</dt>
                <dd>
                  <code>{serviceFolder}</code>
                </dd>
              </div>
              <div>
                <dt>GitHub</dt>
                <dd>
                  <a className="entity-link" href={serviceGithubUrl} target="_blank" rel="noreferrer">
                    Open folder
                  </a>
                </dd>
              </div>
            </dl>
          </article>

          <article className="panel detail-panel">
            <h2>Deployment</h2>
            <dl className="kv-list">
              <div>
                <dt>Health</dt>
                <dd>
                  <span className={`status-pill tone-${healthTone(service.healthStatus)}`}>{service.healthStatus}</span>
                </dd>
              </div>
              <div>
                <dt>Sync</dt>
                <dd>
                  <span className={`status-pill tone-${syncTone(service.syncStatus)}`}>{service.syncStatus}</span>
                </dd>
              </div>
              <div>
                <dt>Image</dt>
                <dd>
                  <code>{service.imageTag ?? "n/a"}</code>
                </dd>
              </div>
              <div>
                <dt>Revision</dt>
                <dd>
                  <code>{shortRevision(service.revision)}</code>
                </dd>
              </div>
              <div>
                <dt>Deployed</dt>
                <dd>{optionalTimestamp(service.deployedAt)}</dd>
              </div>
            </dl>
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

        <ArgoEmbedPanel embedUrl={serviceArgoUrl} />

        <p>
          <Link className="entity-link" href="/services">
            Back to Application Services
          </Link>
        </p>
      </section>
    </PortalFrame>
  );
}
