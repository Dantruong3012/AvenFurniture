import Link from "next/link";
import { notFound } from "next/navigation";
import { CatalogForm, DeleteCatalogForm } from "./catalog-form";
import { readCatalog, type SearchParams } from "@/lib/catalog/queries";
import { uuidPattern, type CatalogKind } from "@/lib/validation/catalog";
import type { Database } from "@/lib/supabase/database.types";
type Category = Database["public"]["Tables"]["categories"]["Row"];
type Product = Database["public"]["Tables"]["products"]["Row"];
type Asset = Database["public"]["Tables"]["media_assets"]["Row"];

export async function CatalogPage({ kind, params }: { kind: CatalogKind; params: SearchParams }) {
  const { supabase, profile, rows, count, filters } = await readCatalog(kind, params);
  const canWrite = kind === "products" || profile.role === "super_admin";
  const title = kind === "products" ? "Products" : "Categories";
  const categories: Category[] = [];
  if (kind === "products") {
    for (let start = 0; ; start += 1000) {
      const result = await supabase.from("categories").select("*").order("sort_order").order("id").range(start, start + 999);
      if (result.error) throw new Error("Categories could not be loaded.");
      categories.push(...result.data);
      if (result.data.length < 1000) break;
    }
  }
  let editing: Category | Product | null = null;
  const assets: Asset[] = [];
  let assetIds = "";
  if (filters.edit && filters.edit !== "new") {
    if (!uuidPattern.test(filters.edit)) notFound();
    const result = await supabase.from(kind).select("*").eq("id", filters.edit).maybeSingle();
    if (result.error) throw new Error("The record could not be loaded.");
    if (!result.data) notFound();
    editing = result.data;
  }
  if (filters.edit && kind === "products") {
    for (let start = 0; ; start += 1000) {
      const result = await supabase.from("media_assets").select("*").order("id").range(start, start + 999);
      if (result.error) throw new Error("Images could not be loaded.");
      assets.push(...result.data);
      if (result.data.length < 1000) break;
    }
    if (editing) {
      const result = await supabase.from("product_images").select("asset_id").eq("product_id", editing.id).order("is_primary", { ascending: false }).order("sort_order").order("id");
      if (result.error) throw new Error("Product images could not be loaded.");
      assetIds = result.data.map((i) => i.asset_id).join(",");
    }
  }
  const initial: Record<string, string> = { active: "on", sort_order: "0", currency: "USD", status: "draft", attributes: "{}", asset_ids: assetIds };
  if (editing) for (const [key, value] of Object.entries(editing)) initial[key] = value === null ? "" : typeof value === "boolean" ? value ? "on" : "" : typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
  if (editing && "attributes" in editing && editing.attributes && typeof editing.attributes === "object" && !Array.isArray(editing.attributes)) {
    const extra = { ...editing.attributes };
    for (const key of ["material", "color", "dimensions"]) { initial[key] = typeof extra[key] === "string" ? extra[key] : extra[key] == null ? "" : JSON.stringify(extra[key]); delete extra[key]; }
    initial.attributes = JSON.stringify(extra, null, 2);
  }
  const pageLink = (page: number) => {
    const query = new URLSearchParams({ q: filters.q, status: filters.status, sort: filters.sort, page: String(page) });
    if (filters.category) query.set("category", filters.category);
    return `/admin/${kind}?${query}`;
  };
  return <div className="admin-content">
    <header className="admin-header"><div><p className="section-note">Catalog management</p><h1>{title}</h1><p>{kind === "products" ? `${count} products · Add, edit and publish items for your storefront.` : `${count} categories · Organize products into groups visitors can browse.`}</p></div>{canWrite && <Link className="btn btn-primary" href={`/admin/${kind}?edit=new`}>New {kind === "products" ? "product" : "category"}</Link>}</header>
    {!canWrite && <p role="status">Categories are read-only for staff. A super admin can create, edit or delete them.</p>}
    {editing && !canWrite && <section className="catalog-editor"><h2>{editing.name}</h2><p className="catalog-description">{editing.description || "No description."}</p><Link className="text-link" href="/admin/categories">Back to categories</Link></section>}
    {(filters.saved || filters.deleted) && <p className="admin-toast" role="status">{filters.deleted ? "Record deleted." : "Changes saved."}</p>}
    {filters.edit && canWrite && <><CatalogForm key={`${kind}-${editing?.id || "new"}-${editing?.updated_at || ""}`} kind={kind} initial={initial} categories={categories} assets={assets}/>{editing && <DeleteCatalogForm kind={kind} id={editing.id} name={editing.name} updatedAt={editing.updated_at} version={"version" in editing ? editing.version : undefined}/>}</>}
    <form className="admin-toolbar" action={`/admin/${kind}`}>
      <label><span className="sr-only">Search {title}</span><input type="search" name="q" defaultValue={filters.q} maxLength={120} placeholder={`Search ${title.toLowerCase()}`}/></label>
      <label><span className="sr-only">Status</span><select name="status" defaultValue={filters.status}><option value="">All statuses</option>{(kind === "categories" ? ["active", "inactive"] : ["draft", "published", "archived"]).map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
      {kind === "products" && <label><span className="sr-only">Category</span><select name="category" defaultValue={filters.category}><option value="">All categories</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
      <label><span className="sr-only">Sort</span><select name="sort" defaultValue={filters.sort}><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="updated">Recently updated</option><option value="name">Name A–Z</option></select></label>
      <button className="btn btn-secondary">Apply</button><Link href={`/admin/${kind}`}>Clear</Link>
    </form>
    <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Name</th><th>{kind === "products" ? "Category / Price" : "Order"}</th><th>Status</th><th>Actions</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}>
      <td><strong>{row.name}</strong><br/><small>{row.slug}</small></td><td>{"category_id" in row ? <>{categories.find((c) => c.id === row.category_id)?.name ?? "Unknown category"}<br/>{row.price === null ? "Request a quote" : `${row.currency} ${Number(row.price).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</> : row.sort_order}</td>
      <td><span className={`admin-status admin-status-${"status" in row ? row.status : row.active ? "published" : "archived"}`}>{"status" in row ? row.status : row.active ? "Active" : "Inactive"}</span>{"featured" in row && row.featured && " · Featured"}</td><td><div className="table-actions">{kind === "products" && <Link href={`/admin/products/${row.id}`}>Preview</Link>}<Link href={`/admin/${kind}?edit=${row.id}`}>{canWrite ? "Edit / Delete" : "View"}</Link></div></td>
    </tr>)}</tbody></table></div>
    {!rows.length && <div className="empty-state compact"><h2>No {title.toLowerCase()} found</h2><p>{filters.page > 1 ? "Try an earlier page." : canWrite ? "Create a record or change the filters." : "Ask a super admin to add categories."}</p></div>}
    <nav className="catalog-pagination" aria-label="Pagination">{filters.page > 1 && <Link href={pageLink(filters.page - 1)}>Previous</Link>}<span>Page {filters.page} · {count} total</span>{filters.page * 20 < count && <Link href={pageLink(filters.page + 1)}>Next</Link>}</nav>
  </div>;
}
