export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { notFound } from "next/navigation";

import { ArgoEmbedPanel } from "../../components/argo-embed-panel";
import { PortalFrame } from "../../components/portal-frame";
import {
  buildArgoApplicationUrl,
  buildGithubFolderUrl,
  findCoreAppByName,
  healthTone,
  loadUniverse,
  optionalTimestamp,
  resolveArgoEmbedUrl,
  resolveGithubBranch,
  resolveGithubRepoUrl,
  shortRevision,
  syncTone
} from "../../lib/plex";

interface PlatformServiceDetailPageProps {
  params: Promise<{
    name: string;
  }>;
}

export default async function PlatformServiceDetailPage({ params }: PlatformServiceDetailPageProps) {
  const { name } = await params;

  const universe = await loadUniverse();
  const appName = decodeURIComponent(name);
  const platformService = findCoreAppByName(universe.coreApps, appName);

  if (!platformService) {
    notFound();
  }

  const embedUrl = resolveArgoEmbedUrl();
  const githubRepoUrl = resolveGithubRepoUrl();
  const githubBranch = resolveGithubBranch();
  const appArgoUrl = buildArgoApplicationUrl(embedUrl, platformService.name);
  const appGithubUrl = platformService.sourcePath
    ? buildGithubFolderUrl(githubRepoUrl, githubBranch, platformService.sourcePath)
    : null;

  return (
    <PortalFrame universe={universe}>
      <section className="portal-main">
        <section className="hero-row">
          <div>
            <p className="eyebrow">Platform Service Details</p>
            <h1>{platformService.name}</h1>
            <p className="hero-subtitle">Detailed platform service metadata and deployment posture.</p>
          </div>
          <a className="open-link" href={appArgoUrl} target="_blank" rel="noreferrer">
            Open In ArgoCD
          </a>
        </section>

        <section className="detail-grid" aria-label="platform-service-details">
          <article className="panel detail-panel">
            <h2>Identity</h2>
            <dl className="kv-list">
              <div>
                <dt>Kind</dt>
                <dd>platform service</dd>
              </div>
              <div>
                <dt>Name</dt>
                <dd>{platformService.name}</dd>
              </div>
              <div>
                <dt>Namespace</dt>
                <dd>{platformService.namespace}</dd>
              </div>
              <div>
                <dt>Source Path</dt>
                <dd>
                  <code>{platformService.sourcePath || "n/a"}</code>
                </dd>
              </div>
              <div>
                <dt>GitHub</dt>
                <dd>
                  {appGithubUrl ? (
                    <a className="entity-link" href={appGithubUrl} target="_blank" rel="noreferrer">
                      Open folder
                    </a>
                  ) : (
                    "n/a"
                  )}
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
                  <span className={`status-pill tone-${healthTone(platformService.healthStatus)}`}>
                    {platformService.healthStatus}
                  </span>
                </dd>
              </div>
              <div>
                <dt>Sync</dt>
                <dd>
                  <span className={`status-pill tone-${syncTone(platformService.syncStatus)}`}>{platformService.syncStatus}</span>
                </dd>
              </div>
              <div>
                <dt>Image</dt>
                <dd>
                  <code>{platformService.imageTag ?? "n/a"}</code>
                </dd>
              </div>
              <div>
                <dt>Revision</dt>
                <dd>
                  <code>{shortRevision(platformService.revision)}</code>
                </dd>
              </div>
              <div>
                <dt>Deployed</dt>
                <dd>{optionalTimestamp(platformService.deployedAt)}</dd>
              </div>
            </dl>
          </article>
        </section>

        <section className="panel">
          <h2>ArgoCD Application</h2>
          <p className="embed-note">
            Embedded page for <strong>{platformService.name}</strong>. If embedding is blocked, use the direct link.
          </p>
          <p>
            <a className="entity-link" href={appArgoUrl} target="_blank" rel="noreferrer">
              {appArgoUrl}
            </a>
          </p>
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

        <ArgoEmbedPanel embedUrl={appArgoUrl} />

        <p>
          <Link className="entity-link" href="/catalog">
            Back to Catalog
          </Link>
        </p>
      </section>
    </PortalFrame>
  );
}
