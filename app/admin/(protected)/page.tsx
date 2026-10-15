import Link from "next/link";
import { requireAdmin } from "@/lib/auth/admin";

export default async function AdminPage() {
  const { supabase, profile } = await requireAdmin();
  const [products, published, drafts, categories, media, recent] = await Promise.all([
    supabase.from("products").select("id", { count: "exact", head: true }),
    supabase.from("products").select("id", { count: "exact", head: true }).eq("status", "published"),
    supabase.from("products").select("id", { count: "exact", head: true }).eq("status", "draft"),
    supabase.from("categories").select("id", { count: "exact", head: true }),
    supabase.from("media_assets").select("id", { count: "exact", head: true }),
    supabase.from("products").select("id,name,slug,status,updated_at,categories(name)").order("updated_at", { ascending: false }).limit(5),
  ]);
  if ([products, published, drafts, categories, media, recent].some((result) => result.error)) throw new Error("Dashboard data could not be loaded. Please retry.");
  const stats = [
    { label: "Products", value: products.count ?? 0, note: "All catalog items", href: "/admin/products" },
    { label: "Published", value: published.count ?? 0, note: "Visible when category is active", href: "/admin/products?status=published" },
    { label: "Drafts", value: drafts.count ?? 0, note: "Waiting to be published", href: "/admin/products?status=draft" },
    { label: "Categories", value: categories.count ?? 0, note: "Product groups", href: "/admin/categories" },
  ];
  return <div className="admin-content admin-overview">
    <header className="admin-overview-header"><div><p className="section-note">Workspace overview</p><h1>Good to see you,<br/>{profile.display_name}.</h1><p>Manage your catalog, product images and account from one place.</p></div><Link className="btn btn-primary" href="/admin/products?edit=new">Add product <span aria-hidden="true">↗</span></Link></header>
    <div className="admin-stats" aria-label="Catalog summary">{stats.map((stat) => <Link className="admin-stat" key={stat.label} href={stat.href}><span>{stat.label}</span><strong>{stat.value}</strong><small>{stat.note}</small></Link>)}</div>
    <div className="admin-dashboard-grid"><section className="admin-panel"><div className="admin-panel-heading"><div><p className="section-note">Catalog activity</p><h2>Recently updated</h2></div><Link href="/admin/products">View all products <span aria-hidden="true">→</span></Link></div>
      {recent.data?.length ? <div className="admin-recent-list">{recent.data.map((product) => <Link key={product.id} href={`/admin/products?edit=${product.id}`}><span><strong>{product.name}</strong><small>{product.categories?.name ?? "Uncategorized"} · Updated {new Date(product.updated_at).toLocaleDateString("en-US")}</small></span><span className={`admin-status admin-status-${product.status}`}>{product.status}</span></Link>)}</div> : <div className="admin-empty"><h3>No products yet</h3><p>{(categories.count ?? 0) === 0 ? "Create a category first, then add your first product." : "Your products will appear here after you add them."}</p><Link href={(categories.count ?? 0) === 0 ? "/admin/categories" : "/admin/products?edit=new"}>{(categories.count ?? 0) === 0 ? "View categories" : "Add a product"} →</Link></div>}
    </section><aside className="admin-panel admin-quick-panel"><p className="section-note">Quick access</p><h2>Keep things moving</h2><div className="admin-quick-links"><Link href="/admin/products"><span><strong>Products</strong><small>Create, edit and publish catalog items</small></span><span aria-hidden="true">↗</span></Link><Link href="/admin/categories"><span><strong>Categories</strong><small>{profile.role === "super_admin" ? "Organize your product groups" : "View product groups"}</small></span><span aria-hidden="true">↗</span></Link><Link href="/admin/media"><span><strong>Media library</strong><small>{media.count ?? 0} images · Upload and reuse photos</small></span><span aria-hidden="true">↗</span></Link>{profile.role === "super_admin" && <Link href="/admin/team"><span><strong>Team & access</strong><small>View accounts and upcoming controls</small></span><span aria-hidden="true">↗</span></Link>}<Link href="/admin/settings/security"><span><strong>Account security</strong><small>Password and authentication</small></span><span aria-hidden="true">↗</span></Link></div></aside></div>
  </div>;
}
