"use client";

import { createContext, ReactNode, useContext, useState } from "react";

interface SidebarContextValue {
  collapsed: boolean;
  toggle: () => void;
}

const SidebarContext = createContext<SidebarContextValue>({
  collapsed: false,
  toggle: () => {},
});

export function useSidebar() {
  return useContext(SidebarContext);
}

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <SidebarContext.Provider value={{ collapsed, toggle: () => setCollapsed((c) => !c) }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function SidebarToggleButton() {
  const { collapsed, toggle } = useSidebar();
  return (
    <button
      className="sidebar-toggle"
      onClick={toggle}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        className={`sidebar-toggle-icon${collapsed ? " rotated" : ""}`}
      >
        <path
          d="M10 12L6 8L10 4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

/** Rendered outside .sidebar-content so it stays visible when collapsed */
export function SidebarExpandButton() {
  const { collapsed, toggle } = useSidebar();
  if (!collapsed) return null;
  return (
    <button
      className="sidebar-expand-btn"
      onClick={toggle}
      aria-label="Expand sidebar"
      title="Expand sidebar"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 16 16"
        fill="none"
      >
        <path
          d="M6 4L10 8L6 12"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
