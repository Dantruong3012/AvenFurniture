export type CatalogKind = "categories" | "products";
export type CatalogState = { error?: string; fields?: Record<string, string>; values?: Record<string, string> };
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function suggestSlug(name: string) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d")
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 160).replace(/-$/, "");
}
export function validateCatalog(kind: CatalogKind, form: FormData) {
  const values: Record<string, string> = {};
  const fields: Record<string, string> = {};
  const text = (key: string, max: number, required = false) => {
    const raw = form.get(key);
    const value = typeof raw === "string" ? raw.trim() : "";
    values[key] = value;
    if ((required && !value) || value.length > max) fields[key] = `Enter ${required ? "1" : "0"}–${max} characters.`;
    return value;
  };
  const name = text("name", kind === "categories" ? 120 : 200, true);
  const slug = text("slug", 160) || suggestSlug(name);
  values.slug = slug;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) fields.slug = "Use lowercase letters, numbers and single hyphens.";
  const description = text("description", 10000);
  const checked = (key: string) => { const value = form.get(key) === "on"; values[key] = value ? "on" : ""; return value; };
  if (kind === "categories") {
    const order = text("sort_order", 12, true);
    if (!/^-?\d+$/.test(order) || Number(order) < -2147483648 || Number(order) > 2147483647) fields.sort_order = "Enter a valid whole number.";
    return { values, fields, data: { name, slug, description, sort_order: Number(order), active: checked("active") } };
  }
  const category_id = text("category_id", 36, true);
  if (!uuidPattern.test(category_id)) fields.category_id = "Choose a category.";
  const status = text("status", 16, true);
  if (!["draft", "published", "archived"].includes(status)) fields.status = "Choose a valid status.";
  if (status === "published" && !description) fields.description = "A description is required to publish.";
  const price = text("price", 14);
  if (price && !/^\d{1,10}(\.\d{1,2})?$/.test(price)) fields.price = "Enter a nonnegative amount with at most two decimals.";
  const currency = text("currency", 3, true).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) fields.currency = "Use a three-letter currency code (USD, VND…).";
  const seo_title = text("seo_title", 200) || null;
  const seo_description = text("seo_description", 500) || null;
  let attributes: Record<string, string | number | boolean | null> = {};
  const rawAttributes = text("attributes", 10000);
  try {
    const parsed = JSON.parse(rawAttributes || "{}");
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error();
    attributes = parsed;
  } catch { fields.attributes = "Enter a valid JSON object."; }
  for (const key of ["material", "color", "dimensions"]) {
    if (form.has(key)) {
      const value = text(key, 300);
      if (value) attributes[key] = value;
      else delete attributes[key];
    }
  }
  return { values, fields, data: { name, slug, description, category_id, status, price: price ? Number(price) : null,
    currency, attributes, featured: checked("featured"), seo_title, seo_description } };
}
export function catalogError(code?: string) {
  switch (code) {
    case "23505": return "This slug is already used by a product, category or previous product URL. Choose another slug.";
    case "23503": case "23001": return "This record is referenced elsewhere. Move its products first, or archive the product instead of deleting it. Check selected images and category still exist.";
    case "PT409": case "40001": return "This record changed or was deleted by another user. Reload before saving again; your input is kept here.";
    case "42501": return "Your session or permissions no longer allow this action. Sign in again.";
    case "23514": case "22023": case "22P02": return "Some values are invalid. Check the fields and try again.";
    default: return "Unable to save changes. Check your connection and retry; reload first if the result is uncertain.";
  }
}
