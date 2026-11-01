import Link from "next/link";
import { requireAdmin } from "@/lib/auth/admin";
import { getOutboxHealthSummary } from "@/lib/email/outbox";
import { OutboxHealthCard } from "@/components/admin/outbox-health-card";
import { getI18n } from "@/lib/i18n/server";


export default async function AdminPage() {
  const { t, locale } = await getI18n();

  const { supabase, profile } = await requireAdmin();
  const [products, published, drafts, categories, media, recent, outboxHealth] = await Promise.all([
    supabase.from("products").select("id", { count: "exact", head: true }),
    supabase.from("products").select("id", { count: "exact", head: true }).eq("status", "published"),
    supabase.from("products").select("id", { count: "exact", head: true }).eq("status", "draft"),
    supabase.from("categories").select("id", { count: "exact", head: true }),
    supabase.from("media_assets").select("id", { count: "exact", head: true }),
    supabase.from("products").select("id,name,slug,status,updated_at,categories(name)").order("updated_at", { ascending: false }).limit(5),
    getOutboxHealthSummary(supabase),
  ]);
  if ([products, published, drafts, categories, media, recent].some((result) => result.error)) throw new Error("Dashboard data could not be loaded. Please retry.");
  const stats = [
    { label: "Products", value: products.count ?? 0, note: "All catalog items", href: "/admin/products" },
    { label: "Published", value: published.count ?? 0, note: "Visible when category is active", href: "/admin/products?status=published" },
    { label: "Drafts", value: drafts.count ?? 0, note: "Waiting to be published", href: "/admin/products?status=draft" },
    { label: "Categories", value: categories.count ?? 0, note: "Product groups", href: "/admin/categories" },
  ];
  return <div className="admin-content admin-overview">
    <header className="admin-overview-header"><div><p className="section-note">{t("Workspace overview")}</p><h1>{t("Good to see you,")}<br/>{profile.display_name}.</h1><p>{t("Manage your catalog, product images and account from one place.")}</p></div><Link className="btn btn-primary" href="/admin/products?edit=new">{t("Add product")}{" "}<span aria-hidden="true">↗</span></Link></header>
    <div className="admin-stats" aria-label={t("Catalog summary")}>{stats.map((stat) => <Link className="admin-stat" key={stat.label} href={stat.href}><span>{t(stat.label ?? "")}</span><strong>{stat.value}</strong><small>{t(stat.note ?? "")}</small></Link>)}</div>
    <div className="admin-dashboard-grid"><section className="admin-panel"><div className="admin-panel-heading"><div><p className="section-note">{t("Catalog activity")}</p><h2>{t("Recently updated")}</h2></div><Link href="/admin/products">{t("View all products")}{" "}<span aria-hidden="true">→</span></Link></div>
      {recent.data?.length ? <div className="admin-recent-list">{recent.data.map((product) => <Link key={product.id} href={`/admin/products?edit=${product.id}`}><span><strong>{product.name}</strong><small>{product.categories?.name ?? t("Uncategorized")}{" "}{t("· Updated")}{" "}{new Date(product.updated_at).toLocaleDateString(locale === "vi" ? "vi-VN" : "en-US")}</small></span><span className={`admin-status admin-status-${product.status}`}>{t(product.status ?? "")}</span></Link>)}</div> : <div className="admin-empty"><h3>{t("No products yet")}</h3><p>{(categories.count ?? 0) === 0 ? t("Create a category first, then add your first product.") : t("Your products will appear here after you add them.")}</p><Link href={(categories.count ?? 0) === 0 ? "/admin/categories" : "/admin/products?edit=new"}>{(categories.count ?? 0) === 0 ? t("View categories") : t("Add a product")} →</Link></div>}
    </section><aside className="admin-panel admin-quick-panel"><p className="section-note">{t("Quick access")}</p><h2>{t("Keep things moving")}</h2><div className="admin-quick-links"><Link href="/admin/products"><span><strong>{t("Products")}</strong><small>{t("Create, edit and publish catalog items")}</small></span><span aria-hidden="true">↗</span></Link><Link href="/admin/categories"><span><strong>{t("Categories")}</strong><small>{profile.role === "super_admin" ? t("Organize your product groups") : t("View product groups")}</small></span><span aria-hidden="true">↗</span></Link><Link href="/admin/media"><span><strong>{t("Media library")}</strong><small>{media.count ?? 0}{" "}{t("images · Upload and reuse photos")}</small></span><span aria-hidden="true">↗</span></Link>{profile.role === "super_admin" && <Link href="/admin/team"><span><strong>{t("Team & access")}</strong><small>{t("View accounts and upcoming controls")}</small></span><span aria-hidden="true">↗</span></Link>}<Link href="/admin/settings/security"><span><strong>{t("Account security")}</strong><small>{t("Password and authentication")}</small></span><span aria-hidden="true">↗</span></Link></div></aside></div>
    <OutboxHealthCard summary={outboxHealth} />
  </div>;
}
