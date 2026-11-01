"use client";
import Link from "next/link";
import Image from "next/image";
import { startTransition, useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { deleteCatalog, saveCategory, saveProduct } from "@/lib/catalog/actions";
import { suggestSlug, type CatalogKind, type CatalogState } from "@/lib/validation/catalog";
import type { Database } from "@/lib/supabase/database.types";
import { MediaUploader } from "@/components/admin/media-uploader";
import { collectionCatalog } from "@/lib/catalog/public";
import { collectionSlugsSchema } from "@/lib/validation/catalog";
type Category = Database["public"]["Tables"]["categories"]["Row"];
type Asset = Database["public"]["Tables"]["media_assets"]["Row"];

export function CatalogForm({ kind, initial, categories = [], assets = [] }: {
  kind: CatalogKind; initial: Record<string, string>; categories?: Category[]; assets?: Asset[];
}) {
  const [state, action, pending] = useActionState<CatalogState, FormData>(kind === "categories" ? saveCategory : saveProduct, {});
  const [dirty, setDirty] = useState(false);
  // Controlled fields survive React's automatic form reset after an action
  // returns a validation error (notably <select> ignores changed defaultValue).
  const initialAttributes = (() => { try { return JSON.parse(initial.attributes || "{}"); } catch { return {}; } })();
  const storedSlugs = initialAttributes && typeof initialAttributes === "object" && !Array.isArray(initialAttributes)
    ? collectionSlugsSchema.safeParse(initialAttributes.collection_slugs) : null;
  const legacySlug = categories.find((category) => category.id === initial.category_id)?.slug;
  const [draft, setDraft] = useState(() => {
    const values = { ...initial };
    if (initialAttributes && typeof initialAttributes === "object" && !Array.isArray(initialAttributes) && "collection_slugs" in initialAttributes) {
      const otherAttributes = { ...initialAttributes };
      delete otherAttributes.collection_slugs;
      values.attributes = JSON.stringify(otherAttributes, null, 2);
    }
    return values;
  });
  const [selectedCollectionSlugs, setSelectedCollectionSlugs] = useState<string[]>(storedSlugs?.success ? storedSlugs.data : legacySlug && collectionCatalog.some((collection) => collection.slug === legacySlug) ? [legacySlug] : []);
  const [collectionSelectionTouched, setCollectionSelectionTouched] = useState(false);
  const setValue = (name: string, value: string) => { setDraft((current) => ({ ...current, [name]: value })); setDirty(true); };
  const [selectedAssets, setSelectedAssets] = useState((initial.asset_ids || "").split(",").filter(Boolean));
  const [availableAssets, setAvailableAssets] = useState(assets);
  const [imageMessage, setImageMessage] = useState("");
  async function saveAlt(id: string, alt: string) {
    const response = await fetch(`/api/admin/media/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ alt }) });
    const result = await response.json();
    if (!response.ok) { setImageMessage(result.error || "Could not save alt text."); return; }
    setAvailableAssets((items) => items.map((item) => item.id === id ? { ...item, alt: result.asset.alt } : item));
    setImageMessage("Alt text saved.");
  }
  useEffect(() => {
    if (!dirty || pending) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    const navigate = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement).closest("a[href]");
      if (anchor && !window.confirm("Discard your unsaved changes?")) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", navigate, true); };
  }, [dirty, pending]);
  const value = (name: string) => draft[name] ?? "";
  const fieldError = (name: string) => state.fields?.[name] ? <span className="field-error" id={`${name}-error`}>{state.fields[name]}</span> : null;
  const input = (name: string, label: string, options: { required?: boolean; maxLength?: number; type?: string; step?: string; min?: string } = {}, hint?: string) =>
    <label>{label}{hint && <span className="field-hint" id={`${name}-hint`}>{hint}</span>}<input name={name} value={value(name)} onChange={(event) => setValue(name, event.target.value)} aria-invalid={!!state.fields?.[name]} aria-describedby={[hint && `${name}-hint`, state.fields?.[name] && `${name}-error`].filter(Boolean).join(" ") || undefined} {...options}/>{fieldError(name)}</label>;
  return <section className="admin-modal catalog-editor"><h2>{initial.id ? "Edit" : "Create"} {kind === "categories" ? "category" : "product"}</h2>
    <form action={action} onSubmit={(event) => {
      // Dispatch explicitly so a returned validation error does not trigger the
      // browser's form.reset(), which also resets native controlled selects.
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      startTransition(() => action(data));
    }} onChange={() => setDirty(true)}>
      <input type="hidden" name="id" value={initial.id || ""}/><input type="hidden" name="version" value={initial.version || ""}/><input type="hidden" name="updated_at" value={initial.updated_at || ""}/>
      {state.error && <p role="alert" className="field-error">{state.error}</p>}
      <fieldset disabled={pending} className="catalog-fields">
        <div className="admin-form-heading"><span>01</span><div><h3>{kind === "categories" ? "Category details" : "Product details"}</h3><p>{kind === "categories" ? "Give this product group a clear name and description." : "Start with the information visitors will see."}</p></div></div>
        <div className="field-row">{input("name", "Name", { required: true, maxLength: kind === "categories" ? 120 : 200 }, kind === "categories" ? "Shown to visitors as a product group, such as Chairs or Tables." : "The product name visitors will see.")}{input("slug", "Slug (leave blank to generate)", { maxLength: 160 }, "The short text used in the page URL. Leave blank to create it from the name.")}</div>
        <button className="text-link" type="button" onClick={() => setValue("slug", suggestSlug(value("name")))}>Generate slug from name</button>
        <label>Description<span className="field-hint">{kind === "categories" ? "Optional introduction to this product group." : "Describe the product for visitors. Include useful details that are not covered below."}</span><textarea name="description" rows={5} maxLength={10000} value={value("description")} onChange={(e) => setValue("description", e.target.value)} aria-invalid={!!state.fields?.description} aria-describedby={state.fields?.description ? "description-error" : undefined}/>{fieldError("description")}</label>
        {kind === "categories" ? <>
          <div className="admin-form-heading"><span>02</span><div><h3>Visibility & order</h3><p>Control where this category appears and whether visitors can browse it.</p></div></div>
          <p className="field-hint">Only super admins can create or change categories. Staff select an existing category when adding a product.</p>
          {input("sort_order", "Display order", { required: true, type: "number", step: "1" }, "Lower numbers appear first in category lists. Categories with the same number are sorted by name.")}
          <label className="check-label"><input name="active" type="checkbox" checked={value("active") === "on"} onChange={(e) => setValue("active", e.target.checked ? "on" : "")}/> Active (visible in public catalog)</label>
          <p>Disabling a category also hides its products from public Supabase access.</p>
        </> : <>
          <div className="admin-form-heading"><span>02</span><div><h3>Publishing & pricing</h3><p>Choose where the product belongs and when visitors can see it.</p></div></div>
          <div className="field-row"><label>Category<span className="field-hint">Choose the group this product belongs to. A super admin creates categories.</span><select required name="category_id" value={value("category_id")} onChange={(e) => {
            setValue("category_id", e.target.value);
            if (!collectionSelectionTouched && (!initial.id || !storedSlugs?.success)) {
              const slug = categories.find((category) => category.id === e.target.value)?.slug;
              setSelectedCollectionSlugs(slug && collectionCatalog.some((collection) => collection.slug === slug) ? [slug] : []);
            }
          }} aria-invalid={!!state.fields?.category_id} aria-describedby={state.fields?.category_id ? "category_id-error" : undefined}><option value="">Choose a category</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}{c.active ? "" : " (inactive)"}</option>)}</select>{fieldError("category_id")}</label>
            <label>Status<span className="field-hint">{value("status") === "published" ? "Published: visible to visitors when its category is active. Requires a main image and alt text for every image." : value("status") === "archived" ? "Archived: hidden from visitors, but kept in Admin for later use." : "Draft: saved in Admin and hidden from visitors until published."}</span><select name="status" value={value("status") || "draft"} onChange={(e) => setValue("status", e.target.value)}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select>{fieldError("status")}</label></div>
          {!categories.length && <p role="status">A super admin must create a category before you can save products.</p>}
          <fieldset aria-describedby={state.fields?.collection_slugs ? "collection_slugs-error" : undefined}>
            <legend>Collections</legend><p className="field-hint">Choose the collections associated with this product.</p>
            <input type="hidden" name="collection_associations_present" value="1"/>
            {collectionCatalog.map((collection) => <label className="check-label" key={collection.slug}>
              <input type="checkbox" name="collection_slugs" value={collection.slug} checked={selectedCollectionSlugs.includes(collection.slug)} onChange={(event) => {
                setSelectedCollectionSlugs((current) => event.target.checked ? [...current, collection.slug] : current.filter((slug) => slug !== collection.slug));
                setCollectionSelectionTouched(true);
                setDirty(true);
              }}/>{collection.name}
            </label>)}
            {fieldError("collection_slugs")}
          </fieldset>
          <div className="field-row">{input("price", "Price (blank = request a quote)", { type: "number", step: "0.01", min: "0" }, "Leave empty if visitors should request a quote instead of seeing a fixed price.")}{input("currency", "Currency", { required: true, maxLength: 3 }, "Three-letter currency code, such as USD or VND.")}</div>
          <div className="admin-form-heading"><span>03</span><div><h3>Product specifications</h3><p>Add useful details so visitors can understand the product.</p></div></div>
          <label className="check-label"><input name="featured" type="checkbox" checked={value("featured") === "on"} onChange={(e) => setValue("featured", e.target.checked ? "on" : "")}/> Featured product</label>
          <p className="field-hint">Featured products may appear in the highlighted section on the home page.</p>
          <div className="field-row three">{input("material", "Material", { maxLength: 300 })}{input("color", "Color", { maxLength: 300 })}{input("dimensions", "Dimensions", { maxLength: 300 })}</div>
          <label>Additional attributes (JSON object)<span className="field-hint">Optional advanced details in JSON format, for example {`{"finish":"matte"}`}. Leave {`{}`} if none.</span><textarea name="attributes" rows={3} maxLength={10000} value={value("attributes")} onChange={(e) => setValue("attributes", e.target.value)} aria-invalid={!!state.fields?.attributes} aria-describedby={state.fields?.attributes ? "attributes-error" : undefined}/>{fieldError("attributes")}</label>
          <div className="admin-form-heading"><span>04</span><div><h3>Search appearance</h3><p>Optional text for search engines. The product name is used by default.</p></div></div>
          {input("seo_title", "SEO title", { maxLength: 200 }, "Optional title shown in search results; the product name is used when blank.")}{input("seo_description", "SEO description", { maxLength: 500 }, "Optional short description for search results.")}
          <fieldset className="catalog-images"><legend>Product images</legend><p>Up to 20 images. The first image is primary. Every image needs alt text before publishing.</p>
            <MediaUploader maxFiles={20 - selectedAssets.length} onUploaded={(asset) => { setAvailableAssets((items) => [asset, ...items]); setSelectedAssets((items) => items.length < 20 ? [...items, asset.id] : items); setDirty(true); }}/>
            <input type="hidden" name="asset_ids" value={selectedAssets.join(",")}/>
            <ol>{selectedAssets.map((id, index) => <li key={id}>
              {availableAssets.find((a) => a.id === id)?.secure_url && <Image className="catalog-image-thumb" src={availableAssets.find((a) => a.id === id)!.secure_url} width={100} height={100} alt=""/>}
              {availableAssets.find((a) => a.id === id)?.public_id || "Unavailable asset"} {index === 0 && "(primary)"}
              <label>Alt text<input defaultValue={availableAssets.find((a) => a.id === id)?.alt || ""} maxLength={500} onBlur={(event) => { const current = availableAssets.find((a) => a.id === id)?.alt || ""; if (event.target.value !== current) void saveAlt(id, event.target.value); }}/></label>
              <button type="button" disabled={index === 0} onClick={() => { setSelectedAssets((current) => { const next = [...current]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; }); setDirty(true); }}>Move up</button>
              <button type="button" onClick={() => { setSelectedAssets((current) => current.filter((a) => a !== id)); setDirty(true); }}>Remove</button></li>)}</ol>
            {imageMessage && <p role="status">{imageMessage}</p>}
            <label>Add existing image<select value="" disabled={selectedAssets.length >= 20} onChange={(e) => { if (e.target.value) setSelectedAssets([...selectedAssets, e.target.value]); setDirty(true); }}><option value="">Choose media asset</option>{availableAssets.filter((a) => a.status === "ready" && !selectedAssets.includes(a.id)).map((a) => <option key={a.id} value={a.id}>{a.alt || a.public_id}</option>)}</select></label>
            {!availableAssets.length && <p>No verified media assets yet. Upload one here or in the media library.</p>}
          </fieldset>
        </>}
        <div className="modal-actions"><Link className="btn btn-secondary" href={`/admin/${kind}`}>Cancel</Link><Button type="submit" disabled={kind === "products" && !categories.length}>{pending ? "Saving…" : "Save changes"}</Button></div>
      </fieldset>
    </form>
  </section>;
}

export function DeleteCatalogForm({ kind, id, name, version, updatedAt }: { kind: CatalogKind; id: string; name: string; version?: number; updatedAt: string }) {
  const [state, action, pending] = useActionState<CatalogState, FormData>(deleteCatalog, {});
  return <details className="catalog-delete"><summary>Delete {kind === "categories" ? "category" : "product"}</summary><form action={action}>
    <input type="hidden" name="kind" value={kind}/><input type="hidden" name="id" value={id}/><input type="hidden" name="version" value={version ?? ""}/><input type="hidden" name="updated_at" value={updatedAt}/>
    <p>Delete “{name}” permanently? {kind === "categories" ? "Move all products to another category first." : "Products linked to inquiry history cannot be deleted; archive them instead. Media files will be kept."}</p>
    {state.error && <p role="alert" className="field-error">{state.error}</p>}
    <label><input type="checkbox" name="confirmed" required disabled={pending}/> I confirm permanent deletion.</label><Button type="submit" className="danger-button" disabled={pending}>{pending ? "Deleting…" : "Delete permanently"}</Button>
  </form></details>;
}
