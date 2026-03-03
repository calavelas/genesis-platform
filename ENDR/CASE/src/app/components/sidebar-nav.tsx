"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/services", label: "Services" },
  { href: "/services/new", label: "Create Service" },
  { href: "/argocd", label: "ArgoCD" }
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }

  if (href === "/services/new") {
    return pathname === "/services/new";
  }

  if (href === "/services") {
    return pathname === "/services" || (pathname.startsWith("/services/") && !pathname.startsWith("/services/new"));
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <ul>
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <li key={item.href} className={active ? "active" : undefined}>
            <Link className="sidebar-link" href={item.href}>
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
