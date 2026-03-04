"use client";

import { ReactNode } from "react";

import { SidebarExpandButton, SidebarProvider, useSidebar } from "./sidebar-context";

interface CollapsibleSidebarProps {
  sidebar: ReactNode;
  children: ReactNode;
}

function SidebarLayout({ sidebar, children }: CollapsibleSidebarProps) {
  const { collapsed } = useSidebar();

  return (
    <div className={`portal-layout${collapsed ? " sidebar-collapsed" : ""}`}>
      <aside className="portal-sidebar">
        <SidebarExpandButton />
        <div className="sidebar-content">
          {sidebar}
        </div>
      </aside>

      {children}
    </div>
  );
}

export function CollapsibleSidebar({ sidebar, children }: CollapsibleSidebarProps) {
  return (
    <SidebarProvider>
      <SidebarLayout sidebar={sidebar} children={children} />
    </SidebarProvider>
  );
}
