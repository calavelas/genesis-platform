"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  aliases?: string[];
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/argocd", label: "ArgoCD" },
  { href: "/catalog", label: "Catalog", aliases: ["/services", "/application-services", "/platform-services"] },
  { href: "/create", label: "Create Service" },
  { href: "/history", label: "History" }
];

function matchesRoute(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function isActive(pathname: string, item: NavItem): boolean {
  if (matchesRoute(pathname, item.href)) {
    return true;
  }
  return (item.aliases ?? []).some((alias) => matchesRoute(pathname, alias));
}

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <ul>
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item);
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
