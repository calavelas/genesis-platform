import { ReactNode } from "react";

import {
  dataSourceTone,
  formatTimestamp,
  hasAttention,
  healthTone,
  PlexUniverse,
  sortByName,
  syncTone
} from "../lib/plex";
import { SidebarNav } from "./sidebar-nav";

interface PortalFrameProps {
  children: ReactNode;
  universe: PlexUniverse;
}

export function PortalFrame({ children, universe }: PortalFrameProps) {
  const coreApps = sortByName(universe.coreApps);
  const serviceApps = sortByName(universe.services);
  const deploymentApps = sortByName([...coreApps, ...serviceApps]);

  const totalServices = serviceApps.length;
  const healthyServices = serviceApps.filter((service) => healthTone(service.healthStatus) === "good").length;
  const syncedDeployments = deploymentApps.filter((app) => syncTone(app.syncStatus) === "good").length;
  const attentionCount = deploymentApps.filter(hasAttention).length;

  return (
    <main className="portal-shell">
      <header className="portal-topbar">
        <div className="topbar-brand">
          <span className="brand-dot" />
          <strong>CASE</strong>
          <span>Platform View</span>
        </div>

        <div className="topbar-status">
          <span className={`chip tone-${dataSourceTone(universe.dataSource)}`}>{universe.dataSource}</span>
          <span className="chip muted">Updated {formatTimestamp(universe.generatedAt)}</span>
        </div>
      </header>

      <div className="portal-layout">
        <aside className="portal-sidebar">
          <section className="sidebar-block">
            <h2>Navigation</h2>
            <SidebarNav />
          </section>

          <section className="sidebar-block">
            <h2>Overview</h2>
            <dl>
              <div>
                <dt>Services</dt>
                <dd>{totalServices}</dd>
              </div>
              <div>
                <dt>Healthy</dt>
                <dd>{healthyServices}</dd>
              </div>
              <div>
                <dt>Synced</dt>
                <dd>{syncedDeployments}</dd>
              </div>
              <div>
                <dt>Attention</dt>
                <dd>{attentionCount}</dd>
              </div>
            </dl>
          </section>
        </aside>

        {children}
      </div>
    </main>
  );
}
