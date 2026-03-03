export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";

import { PortalFrame } from "../../components/portal-frame";
import { loadUniverse } from "../../lib/plex";
import { ServiceHistoryPanel } from "./service-history-panel";

interface ServiceHistoryPageProps {
  params: Promise<{
    serviceName: string;
  }>;
}

export default async function ServiceHistoryPage({ params }: ServiceHistoryPageProps) {
  const { serviceName } = await params;
  const decodedServiceName = decodeURIComponent(serviceName);
  const universe = await loadUniverse();

  return (
    <PortalFrame universe={universe}>
      <section className="portal-main">
        <section className="hero-row">
          <div>
            <p className="eyebrow">Audit</p>
            <h1>Service History: {decodedServiceName}</h1>
            <p className="hero-subtitle">CASE PR and pipeline lifecycle for this service.</p>
          </div>
          <Link className="open-link" href="/history">
            Back to Create Service History
          </Link>
        </section>

        <ServiceHistoryPanel serviceName={decodedServiceName} />
      </section>
    </PortalFrame>
  );
}
