"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { signOut } from "@/lib/auth/actions";

const navigation = [
  { href: "/admin", label: "Overview", description: "Dashboard" },
  { href: "/admin/products", label: "Products", description: "Catalog" },
  { href: "/admin/inquiries", label: "Inquiries", description: "Customer requests" },
  { href: "/admin/categories", label: "Categories", description: "Product groups" },
  { href: "/admin/media", label: "Media library", description: "Product images" },
  { href: "/admin/team", label: "Team & access", description: "Staff accounts", superAdminOnly: true },
  { href: "/admin/settings/security", label: "Account security", description: "Password & MFA" },
];

export function CatalogShell({ children, role, name }: { children: ReactNode; role: string; name: string }) {
  const pathname = usePathname();
  return <div className="admin-shell">
    <aside className="admin-nav" aria-label="Admin workspace">
      <Link className="admin-brand" href="/admin"><span className="admin-brand-mark">A</span><span><strong>AvenFurniture</strong><small>Management workspace</small></span></Link>
      <div className="admin-identity"><span className="admin-avatar" aria-hidden="true">{name.trim().charAt(0).toUpperCase() || "A"}</span><span><strong>{name}</strong><small>{role === "super_admin" ? "Super admin" : "Staff"}</small></span></div>
      <p className="admin-nav-heading">Workspace</p>
      <nav aria-label="Admin navigation">{navigation.filter((item) => !item.superAdminOnly || role === "super_admin").map((item) => {
        const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
        return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}><span>{item.label}</span><small>{item.description}</small></Link>;
      })}</nav>
      <div className="admin-nav-bottom"><Link href="/">View storefront <span aria-hidden="true">↗</span></Link><form action={signOut}><button type="submit">Sign out <span aria-hidden="true">→</span></button></form></div>
    </aside>
    <div className="admin-workspace"><div className="admin-topbar"><span>AVENFURNITURE / ADMIN</span><span>{role === "super_admin" ? "Super admin" : "Staff"} workspace</span></div><div className="admin-main">{children}</div></div>
  </div>;
}
