"use client";
import { useRef, useState } from "react";
import type { Tables } from "@/lib/supabase/database.types";
type Asset = Tables<"media_assets">;
type Upload = { id: string; file: File; progress: number; error?: string; done?: boolean; response?: Record<string, unknown> };

async function uploadFile(file: File, onProgress: (value: number) => void, onResponse: (value: Record<string, unknown>) => void, previousResponse?: Record<string, unknown>): Promise<Asset> {
  let response = previousResponse;
  if (!response) {
    const signed = await fetch("/api/admin/media/sign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: file.name, mime: file.type, bytes: file.size }) });
    const intent = await signed.json();
    if (!signed.ok) throw new Error(intent.error || "Could not start upload.");
    const body = new FormData();
    body.set("file", file);
    Object.entries(intent.params as Record<string, string>).forEach(([key, value]) => body.set(key, value));
    body.set("api_key", intent.apiKey);
    body.set("signature", intent.signature);
    response = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", intent.uploadUrl);
      xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100)); };
      xhr.onerror = () => reject(new Error("Network error during upload."));
      xhr.onload = () => {
        try { const data = JSON.parse(xhr.responseText); if (xhr.status < 200 || xhr.status >= 300) reject(new Error("Cloudinary rejected the image.")); else resolve(data); }
        catch { reject(new Error("Invalid upload response.")); }
      };
      xhr.send(body);
    });
    onResponse(response);
  }
  const completed = await fetch("/api/admin/media/complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ upload: response, alt: "" }) });
  const result = await completed.json();
  if (!completed.ok) throw new Error(result.error || "Could not verify upload.");
  return result.asset as Asset;
}

export function MediaUploader({ onUploaded, maxFiles = Number.POSITIVE_INFINITY }: { onUploaded: (asset: Asset) => void; maxFiles?: number }) {
  const picker = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragging, setDragging] = useState(false);
  async function process(item: Upload) {
    const update = (change: Partial<Upload>) => setUploads((items) => items.map((entry) => entry.id === item.id ? { ...entry, ...change } : entry));
    update({ error: undefined });
    try { const asset = await uploadFile(item.file, (progress) => update({ progress }), (response) => update({ response }), item.response); update({ progress: 100, done: true }); onUploaded(asset); }
    catch (error) { update({ error: error instanceof Error ? error.message : "Upload failed." }); }
  }
  async function run(files: File[]) {
    if (maxFiles <= 0) return;
    for (const file of files.slice(0, maxFiles)) {
      if (!["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type) || file.size < 1 || file.size > 10 * 1024 * 1024) {
        setUploads((items) => [...items, { id: crypto.randomUUID(), file, progress: 0, error: "Use JPEG, PNG, WebP or AVIF up to 10 MB." }]);
        continue;
      }
      const id = crypto.randomUUID();
      const item = { id, file, progress: 0 };
      setUploads((items) => [...items, item]);
      await process(item);
    }
  }
  return <div className={`media-drop ${dragging ? "dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); if (maxFiles > 0) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); void run(Array.from(event.dataTransfer.files)); }}>
    <input ref={picker} type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple disabled={maxFiles <= 0} className="sr-only" onChange={(event) => { void run(Array.from(event.target.files || [])); event.target.value = ""; }}/>
    <p>{maxFiles <= 0 ? "Remove an image before uploading another." : <>Drop images here or <button type="button" className="text-link" onClick={() => picker.current?.click()}>choose files</button></>}</p><small>JPEG, PNG, WebP, AVIF · 10 MB per image{Number.isFinite(maxFiles) ? ` · ${maxFiles} slots remaining` : ""}</small>
    {uploads.length > 0 && <ul aria-live="polite">{uploads.map((item) => <li key={item.id}>{item.file.name} — {item.done ? "Uploaded" : item.error || `${item.progress}%`}{item.error && <button type="button" onClick={() => void process(item)}>Retry</button>}</li>)}</ul>}
  </div>;
}
