import { ReactNode } from "react";

import {
  dataSourceTone,
  formatTimestamp,
  PlexUniverse
} from "../lib/plex";
import { AutoRefresh } from "./auto-refresh";
import { SidebarNav } from "./sidebar-nav";

interface PortalFrameProps {
  children: ReactNode;
  universe: PlexUniverse;
}

export function PortalFrame({ children, universe }: PortalFrameProps) {
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

      <div className="portal-layout">
        <aside className="portal-sidebar">
          <section className="sidebar-block">
            <h2 className="section-header-brand">Navigation</h2>
            <SidebarNav />
          </section>
        </aside>

        {children}
      </div>
    </main>
  );
}
