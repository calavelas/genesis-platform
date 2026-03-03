export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";

import { PortalFrame } from "../../components/portal-frame";
import { loadUniverse } from "../../lib/plex";
import { ServiceCreatePanel } from "./service-create-panel";

export default async function NewServicePage() {
  const universe = await loadUniverse();

  return (
    <PortalFrame universe={universe}>
      <section className="portal-main">
        <section className="hero-row">
          <div>
            <p className="eyebrow">Provisioning</p>
            <h1>Create Service</h1>
            <p className="hero-subtitle">Scaffold service + gitops files, update SVCS.yaml, and open a pull request.</p>
          </div>
          <Link className="open-link" href="/services">
            Back to Services
          </Link>
        </section>

        <ServiceCreatePanel />
      </section>
    </PortalFrame>
  );
}
