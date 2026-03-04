import { ReactNode } from "react";

import {
  dataSourceTone,
  formatTimestamp,
  hasAttention,
  PlexUniverse
} from "../lib/plex";
import { AutoRefresh } from "./auto-refresh";
import { CollapsibleSidebar } from "./collapsible-sidebar";
import { SidebarToggleButton } from "./sidebar-context";
import { SidebarNav } from "./sidebar-nav";

interface PortalFrameProps {
  children: ReactNode;
  universe: PlexUniverse;
}

export function PortalFrame({ children, universe }: PortalFrameProps) {
  const deploymentApps = [...universe.coreApps, ...universe.services];
  const syncedDeployments = deploymentApps.filter((app) => app.syncStatus.trim().toLowerCase() === "synced").length;
  const attentionCount = deploymentApps.filter(hasAttention).length;

  const sidebarContent = (
    <>
      <section className="sidebar-block">
        <div className="sidebar-block-header">
          <h2 className="section-header-brand">Navigation</h2>
          <SidebarToggleButton />
        </div>
        <SidebarNav />
      </section>

      <section className="sidebar-block">
        <h2 className="section-header-brand">Overview</h2>
        <dl className="sidebar-summary-list">
          <div>
            <dt>Application Services</dt>
            <dd>{universe.services.length}</dd>
          </div>
          <div>
            <dt>Platform Services</dt>
            <dd>{universe.coreApps.length}</dd>
          </div>
          <div>
            <dt>Synced</dt>
            <dd>{syncedDeployments}</dd>
          </div>
          <div>
            <dt>Needs Attention</dt>
            <dd className={attentionCount > 0 ? "tone-bad" : "tone-good"}>{attentionCount}</dd>
          </div>
        </dl>
      </section>
    </>
  );

  return (
    <main className="portal-shell">
      <AutoRefresh />

      <header className="portal-topbar">
        <div className="topbar-brand">
          <span className="brand-dot" />
          <strong>ENDR</strong>
          <span className="topbar-purpose">Internal Developer Platform</span>
        </div>

        <div className="topbar-status">
          <span className={`chip tone-${dataSourceTone(universe.dataSource)}`}>{universe.dataSource}</span>
          <span className="chip muted">Updated {formatTimestamp(universe.generatedAt)}</span>
        </div>
      </header>

      <CollapsibleSidebar sidebar={sidebarContent}>
        {children}
      </CollapsibleSidebar>
    </main>
  );
}
