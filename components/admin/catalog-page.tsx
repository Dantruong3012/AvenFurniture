import Link from "next/link";
import { notFound } from "next/navigation";
import { CatalogForm, DeleteCatalogForm } from "./catalog-form";
import { readCatalog, type SearchParams } from "@/lib/catalog/queries";
import { uuidPattern, type CatalogKind } from "@/lib/validation/catalog";
import type { Database } from "@/lib/supabase/database.types";
import { getI18n } from "@/lib/i18n/server";

type Category = Database["public"]["Tables"]["categories"]["Row"];
type Product = Database["public"]["Tables"]["products"]["Row"];
type Asset = Database["public"]["Tables"]["media_assets"]["Row"];

export async function CatalogPage({ kind, params }: { kind: CatalogKind; params: SearchParams }) {
  const { t, locale } = await getI18n();

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
    <header className="admin-header"><div><p className="section-note">{t("Catalog management")}</p><h1>{t(title ?? "")}</h1><p>{kind === "products" ? t("{v0} products · Add, edit and publish items for your storefront.", { v0: count }) : t("{v0} categories · Organize products into groups visitors can browse.", { v0: count })}</p></div>{canWrite && <Link className="btn btn-primary" href={`/admin/${kind}?edit=new`}>{t("New")}{" "}{kind === "products" ? t("product") : t("category")}</Link>}</header>
    {!canWrite && <p role="status">{t("Categories are read-only for staff. A super admin can create, edit or delete them.")}</p>}
    {editing && !canWrite && <section className="catalog-editor"><h2>{editing.name}</h2><p className="catalog-description">{editing.description || t("No description.")}</p><Link className="text-link" href="/admin/categories">{t("Back to categories")}</Link></section>}
    {(filters.saved || filters.deleted) && <p className="admin-toast" role="status">{filters.deleted ? t("Record deleted.") : t("Changes saved.")}</p>}
    {filters.edit && canWrite && <><CatalogForm key={`${kind}-${editing?.id || "new"}-${editing?.updated_at || ""}`} kind={kind} initial={initial} categories={categories} assets={assets}/>{editing && <DeleteCatalogForm kind={kind} id={editing.id} name={editing.name} updatedAt={editing.updated_at} version={"version" in editing ? editing.version : undefined}/>}</>}
    <form className="admin-toolbar" action={`/admin/${kind}`}>
      <label><span className="sr-only">{t("Search")}{" "}{t(title ?? "")}</span><input type="search" name="q" defaultValue={filters.q} maxLength={120} placeholder={t("Search {v0}", { v0: t(title.toLowerCase()) })}/></label>
      <label><span className="sr-only">{t("Status")}</span><select name="status" defaultValue={filters.status}><option value="">{t("All statuses")}</option>{(kind === "categories" ? ["active", "inactive"] : ["draft", "published", "archived"]).map((s) => <option key={s} value={s}>{t(s)}</option>)}</select></label>
      {kind === "products" && <label><span className="sr-only">{t("Category")}</span><select name="category" defaultValue={filters.category}><option value="">{t("All categories")}</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
      <label><span className="sr-only">{t("Sort")}</span><select name="sort" defaultValue={filters.sort}><option value="newest">{t("Newest")}</option><option value="oldest">{t("Oldest")}</option><option value="updated">{t("Recently updated")}</option><option value="name">{t("Name A–Z")}</option></select></label>
      <button className="btn btn-secondary">{t("Apply")}</button><Link href={`/admin/${kind}`}>{t("Clear")}</Link>
    </form>
    <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>{t("Name")}</th><th>{kind === "products" ? t("Category / Price") : t("Order")}</th><th>{t("Status")}</th><th>{t("Actions")}</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}>
      <td><strong>{row.name}</strong><br/><small>{row.slug}</small></td><td>{"category_id" in row ? <>{categories.find((c) => c.id === row.category_id)?.name ?? t("Unknown category")}<br/>{row.price === null ? t("Request a quote") : `${row.currency} ${Number(row.price).toLocaleString(locale === "vi" ? "vi-VN" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</> : row.sort_order}</td>
      <td><span className={`admin-status admin-status-${"status" in row ? row.status : row.active ? "published" : "archived"}`}>{"status" in row ? t(row.status) : row.active ? t("Active") : t("Inactive")}</span>{"featured" in row && row.featured && t(" · Featured")}</td><td><div className="table-actions">{kind === "products" && <Link href={`/admin/products/${row.id}`}>{t("Preview")}</Link>}<Link href={`/admin/${kind}?edit=${row.id}`}>{canWrite ? t("Edit / Delete") : t("View")}</Link></div></td>
    </tr>)}</tbody></table></div>
    {!rows.length && <div className="empty-state compact"><h2>{t("No")}{" "}{t(title.toLowerCase() ?? "")}{" "}{t("found")}</h2><p>{filters.page > 1 ? t("Try an earlier page.") : canWrite ? t("Create a record or change the filters.") : t("Ask a super admin to add categories.")}</p></div>}
    <nav className="catalog-pagination" aria-label={t("Pagination")}>{filters.page > 1 && <Link href={pageLink(filters.page - 1)}>{t("Previous")}</Link>}<span>{t("Page")}{" "}{filters.page} · {count}{" "}{t("total")}</span>{filters.page * 20 < count && <Link href={pageLink(filters.page + 1)}>{t("Next")}</Link>}</nav>
  </div>;
}
