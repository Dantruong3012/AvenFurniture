"use client";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { CART_STORAGE_KEY, normalizeCartItems } from "@/lib/cart/policy";
import { createClient } from "@/lib/supabase/client";
import type { CartItem } from "@/lib/types";

interface StoreContextValue {
  cart: CartItem[]; wishlist: string[]; hydrated: boolean;
  cartSync: "guest" | "syncing" | "synchronized" | "error";
  addToCart: (productId: string, quantity?: number) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;
  toggleWishlist: (productId: string) => void;
}
const StoreContext = createContext<StoreContextValue | null>(null);
const WISHLIST_KEY = "aven-furniture-wishlist-v1";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function readStored(key: string): unknown { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; } }

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [cartSync, setCartSync] = useState<StoreContextValue["cartSync"]>("guest");
  const cartRef = useRef<CartItem[]>([]);
  const revision = useRef(0);
  const authenticated = useRef(false);
  const persistenceReady = useRef(false);
  useEffect(() => {
    const storedCart = readStored(CART_STORAGE_KEY);
    const storedWishlist = readStored(WISHLIST_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCart(normalizeCartItems(storedCart));
    setWishlist(Array.isArray(storedWishlist) ? [...new Set(storedWishlist.filter((id) => typeof id === "string" && uuid.test(id)))].slice(0, 100) as string[] : []);
    localStorage.removeItem("aven-furniture-products-v1");
    setHydrated(true);
  }, []);
  useEffect(() => { cartRef.current = cart; if (hydrated) localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart)); }, [cart, hydrated]);
  useEffect(() => { if (hydrated) localStorage.setItem(WISHLIST_KEY, JSON.stringify(wishlist)); }, [wishlist, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    let active = true;
    const supabase = createClient();
    async function mergeOnSignIn() {
      const startedAt = revision.current;
      authenticated.current = true;
      persistenceReady.current = false;
      setCartSync("syncing");
      try {
        const response = await fetch("/api/cart/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: cartRef.current }) });
        const result = await response.json() as { items?: unknown };
        if (!active || !response.ok || !Array.isArray(result.items)) throw new Error("sync failed");
        const merged = normalizeCartItems(result.items);
        setCart((current) => startedAt === revision.current ? merged : current);
        persistenceReady.current = true;
        setCartSync("synchronized");
      } catch {
        if (active) setCartSync("error");
      }
    }
    void supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      if (data.user?.email_confirmed_at) void mergeOnSignIn();
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        authenticated.current = false;
        persistenceReady.current = false;
        setCartSync("guest");
      } else if (event === "SIGNED_IN" && session?.user.email_confirmed_at) {
        queueMicrotask(() => { if (active) void mergeOnSignIn(); });
      }
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, [hydrated]);
  useEffect(() => {
    if (!hydrated || !authenticated.current || !persistenceReady.current) return;
    const timeout = window.setTimeout(async () => {
      if (!authenticated.current || !persistenceReady.current) return;
      setCartSync("syncing");
      try {
        const response = await fetch("/api/cart/sync", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: cart }) });
        if (!response.ok) throw new Error("sync failed");
        setCartSync("synchronized");
      } catch { setCartSync("error"); }
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [cart, hydrated]);
  const value = useMemo<StoreContextValue>(() => ({ cart, wishlist, hydrated, cartSync,
    addToCart(productId, quantity = 1) { if (!uuid.test(productId) || !Number.isSafeInteger(quantity)) return; revision.current += 1; setCart((items) => normalizeCartItems([...items, { productId, quantity }])); },
    updateQuantity(productId, quantity) { if (!Number.isSafeInteger(quantity)) return; revision.current += 1; setCart((items) => quantity < 1 ? items.filter((item) => item.productId !== productId) : normalizeCartItems(items.map((item) => item.productId === productId ? { ...item, quantity } : item))); },
    removeFromCart(productId) { revision.current += 1; setCart((items) => items.filter((item) => item.productId !== productId)); },
    clearCart() { revision.current += 1; setCart([]); },
    toggleWishlist(productId) { if (!uuid.test(productId)) return; setWishlist((items) => items.includes(productId) ? items.filter((id) => id !== productId) : [...items, productId].slice(0, 100)); },
  }), [cart, wishlist, hydrated, cartSync]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
export function useStore() { const value = useContext(StoreContext); if (!value) throw new Error("useStore must be used within StoreProvider"); return value; }
