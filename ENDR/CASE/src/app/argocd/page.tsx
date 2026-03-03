export const dynamic = "force-dynamic";
export const revalidate = 0;

import { ArgoEmbedPanel } from "../components/argo-embed-panel";
import { PortalFrame } from "../components/portal-frame";
import { loadUniverse, resolveArgoEmbedUrl } from "../lib/plex";

export default async function ArgoCdPage() {
  const universe = await loadUniverse();
  const embedUrl = resolveArgoEmbedUrl();

  return (
    <PortalFrame universe={universe}>
      <section className="portal-main">
        <section className="hero-row">
          <div>
            <p className="eyebrow">ArgoCD</p>
            <h1>Embedded ArgoCD</h1>
            <p className="hero-subtitle">Read-only embedded operational view.</p>
          </div>
          <a className="open-link" href={embedUrl} target="_blank" rel="noreferrer">
            Open ArgoCD
          </a>
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
      </section>
    </PortalFrame>
  );
}
