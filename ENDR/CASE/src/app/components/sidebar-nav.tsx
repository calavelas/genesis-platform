"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/argocd", label: "ArgoCD" },
  { href: "/services", label: "Application Services" },
  { href: "/platform-services", label: "Platform Services" },
  { href: "/create", label: "Create Service" },
  { href: "/history", label: "Create Service History" }
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
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
