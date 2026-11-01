"use client";
import { useMemo, useState } from "react";
import { MediaUploader } from "./media-uploader";
import type { Tables } from "@/lib/supabase/database.types";
import { useI18n } from "@/lib/i18n/client";

type Asset = Tables<"media_assets"> & { usage: number };

export function MediaLibrary({ initial }: { initial: Asset[] }) {
  const { t } = useI18n();

  const [assets, setAssets] = useState(initial);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const visible = useMemo(() => assets.filter((a) => (filter === "all" || (filter === "used" ? a.usage > 0 : a.usage === 0)) && `${a.public_id} ${a.alt}`.toLowerCase().includes(search.toLowerCase())), [assets, filter, search]);
  async function saveAlt(id: string, alt: string) {
    setBusy(id); setMessage("");
    try {
      const response = await fetch(`/api/admin/media/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ alt }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setAssets((items) => items.map((item) => item.id === id ? { ...item, alt: result.asset.alt } : item)); setMessage("Alt text saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save alt text."); }
    finally { setBusy(null); }
  }
  async function remove(id: string) {
    if (!window.confirm(t("Delete this unused image from Cloudinary and the media library?"))) return;
    setBusy(id); setMessage("");
    try {
      const response = await fetch(`/api/admin/media/${id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setAssets((items) => items.filter((item) => item.id !== id)); setMessage("Image deleted.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not delete image."); }
    finally { setBusy(null); }
  }
  return <><MediaUploader onUploaded={(asset) => setAssets((items) => [{ ...asset, usage: 0 }, ...items])}/>
    <div className="admin-toolbar"><label><span className="sr-only">{t("Search images")}</span><input type="search" placeholder={t("Search images")} value={search} onChange={(e) => setSearch(e.target.value)}/></label><label>{t("Usage")}{" "}<select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">{t("All images")}</option><option value="used">{t("Used in products")}</option><option value="unused">{t("Not used yet")}</option></select></label></div>
    {message && <p role="status">{t(message)}</p>}
    {!visible.length && <div className="empty-state compact"><h2>{t("No images found")}</h2><p>{t("Upload an image or change your filters.")}</p></div>}
    <div className="media-grid">{visible.map((asset) => <MediaTile key={asset.id} asset={asset} busy={busy === asset.id} saveAlt={saveAlt} remove={remove}/>)}</div>
  </>;
}
function MediaTile({ asset, busy, saveAlt, remove }: { asset: Asset; busy: boolean; saveAlt: (id: string, alt: string) => void; remove: (id: string) => void }) {
  const { t } = useI18n();

  const [alt, setAlt] = useState(asset.alt);
  return <article className="media-tile">
    {/* URLs originate from verified Cloudinary resources. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={asset.secure_url} alt={asset.alt || t("Image awaiting alt text")}/>
    <p>{asset.width} × {asset.height} · {asset.format.toUpperCase()} · {asset.bytes ? t("{v0} MB", { v0: (asset.bytes / 1024 / 1024).toFixed(2) }) : t("Legacy")}</p>
    <p>{asset.usage}{" "}{t("products ·")}{" "}{t(asset.status)}</p>
    <label>{t("Alt text")}<input value={alt} maxLength={500} onChange={(e) => setAlt(e.target.value)} /></label>
    <div className="table-actions"><button disabled={busy || alt === asset.alt || asset.status !== "ready"} onClick={() => saveAlt(asset.id, alt)}>{t("Save alt")}</button><button disabled={busy || asset.usage > 0} onClick={() => remove(asset.id)}>{asset.status === "delete_failed" || asset.status === "deleting" ? t("Retry delete") : t("Delete")}</button></div>
  </article>;
}
