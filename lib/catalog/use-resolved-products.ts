"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CatalogProduct } from "@/lib/catalog/public";

export function useResolvedProducts(ids: string[], hydrated: boolean) {
  const key = useMemo(() => [...new Set(ids)].join(","), [ids]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!hydrated) return;
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true); setError("");
    if (!key) { setProducts([]); setLoading(false); return; }
    fetch(`/api/catalog/resolve?ids=${encodeURIComponent(key)}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not load saved products."); return data.products as CatalogProduct[]; })
      .then((data) => { setProducts(data); setLoading(false); })
      .catch((cause) => { if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : "Could not load saved products."); setLoading(false); } });
    return () => controller.abort();
  }, [key, hydrated, retry]);
  const reload = useCallback(() => setRetry((value) => value + 1), []);
  return { products, loading: !hydrated || loading, error, reload };
}
