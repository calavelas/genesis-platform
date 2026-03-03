export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";

import { PortalFrame } from "../components/portal-frame";
import { loadUniverse } from "../lib/plex";
import { HistoryPanel } from "./history-panel";

export default async function HistoryPage() {
  const universe = await loadUniverse();

  return (
    <PortalFrame universe={universe}>
      <section className="portal-main">
        <section className="hero-row">
          <div>
            <p className="eyebrow">Audit</p>
            <h1>Create Service History</h1>
            <p className="hero-subtitle">
              Tracks pull requests created by CASE UI using the title format <code>CASE - Adding service :</code>.
            </p>
          </div>
          <Link className="open-link" href="/create">
            Create Service
          </Link>
        </section>

        <HistoryPanel />
      </section>
    </PortalFrame>
  );
}
