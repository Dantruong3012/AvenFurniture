"use client";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { CART_STORAGE_KEY, normalizeCartItems } from "@/lib/cart/policy";
import { createClient } from "@/lib/supabase/client";
import type { CartItem } from "@/lib/types";
import { normalizeWishlistItems, WISHLIST_STORAGE_KEY } from "@/lib/wishlist/policy";

interface StoreContextValue {
  cart: CartItem[]; wishlist: string[]; hydrated: boolean;
  cartSync: "guest" | "syncing" | "synchronized" | "error";
  wishlistSync: "guest" | "syncing" | "synchronized" | "error";
  addToCart: (productId: string, quantity?: number) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;
  toggleWishlist: (productId: string) => void;
}
const StoreContext = createContext<StoreContextValue | null>(null);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function readStored(key: string): unknown { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; } }

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [cartSync, setCartSync] = useState<StoreContextValue["cartSync"]>("guest");
  const [wishlistSync, setWishlistSync] = useState<StoreContextValue["wishlistSync"]>("guest");
  const [wishlistPersistenceReady, setWishlistPersistenceReady] = useState(false);
  const cartRef = useRef<CartItem[]>([]);
  const wishlistRef = useRef<string[]>([]);
  const cartRevision = useRef(0);
  const wishlistRevision = useRef(0);
  const authenticated = useRef(false);
  const cartPersistenceReady = useRef(false);
  useEffect(() => {
    const storedCart = readStored(CART_STORAGE_KEY);
    const storedWishlist = readStored(WISHLIST_STORAGE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCart(normalizeCartItems(storedCart));
    setWishlist(normalizeWishlistItems(storedWishlist));
    localStorage.removeItem("aven-furniture-products-v1");
    setHydrated(true);
  }, []);
  useEffect(() => { cartRef.current = cart; if (hydrated) localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart)); }, [cart, hydrated]);
  useEffect(() => { wishlistRef.current = wishlist; if (hydrated) localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(wishlist)); }, [wishlist, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    let active = true;
    const supabase = createClient();
    async function mergeOnSignIn() {
      const startedAt = cartRevision.current;
      authenticated.current = true;
      cartPersistenceReady.current = false;
      setCartSync("syncing");
      try {
        const response = await fetch("/api/cart/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: cartRef.current }) });
        const result = await response.json() as { items?: unknown };
        if (!active || !response.ok || !Array.isArray(result.items)) throw new Error("sync failed");
        const merged = normalizeCartItems(result.items);
        setCart((current) => startedAt === cartRevision.current ? merged : current);
        cartPersistenceReady.current = true;
        setCartSync("synchronized");
      } catch {
        if (active) setCartSync("error");
      }
    }
    async function mergeWishlistOnSignIn() {
      const startedAt = wishlistRevision.current;
      authenticated.current = true;
      setWishlistPersistenceReady(false);
      setWishlistSync("syncing");
      try {
        const response = await fetch("/api/wishlist/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: wishlistRef.current }) });
        const result = await response.json() as { items?: unknown };
        if (!active || !response.ok || !Array.isArray(result.items)) throw new Error("sync failed");
        const merged = normalizeWishlistItems(result.items);
        setWishlist((current) => startedAt === wishlistRevision.current ? merged : current);
        setWishlistPersistenceReady(true);
        setWishlistSync("synchronized");
      } catch {
        if (active) setWishlistSync("error");
      }
    }
    function mergeCustomerState() {
      void mergeOnSignIn();
      void mergeWishlistOnSignIn();
    }
    void supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      if (data.user?.email_confirmed_at) mergeCustomerState();
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        authenticated.current = false;
        cartPersistenceReady.current = false;
        setWishlistPersistenceReady(false);
        setCartSync("guest");
        setWishlistSync("guest");
      } else if (event === "SIGNED_IN" && session?.user.email_confirmed_at) {
        queueMicrotask(() => { if (active) mergeCustomerState(); });
      }
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, [hydrated]);
  useEffect(() => {
    if (!hydrated || !authenticated.current || !cartPersistenceReady.current) return;
    const timeout = window.setTimeout(async () => {
      if (!authenticated.current || !cartPersistenceReady.current) return;
      setCartSync("syncing");
      try {
        const response = await fetch("/api/cart/sync", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: cart }) });
        if (!response.ok) throw new Error("sync failed");
        setCartSync("synchronized");
      } catch { setCartSync("error"); }
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [cart, hydrated]);
  useEffect(() => {
    if (!hydrated || !authenticated.current || !wishlistPersistenceReady) return;
    const timeout = window.setTimeout(async () => {
      if (!authenticated.current) return;
      setWishlistSync("syncing");
      try {
        const response = await fetch("/api/wishlist/sync", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: wishlist }) });
        if (!response.ok) throw new Error("sync failed");
        setWishlistSync("synchronized");
      } catch { setWishlistSync("error"); }
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [wishlist, hydrated, wishlistPersistenceReady]);
  const value = useMemo<StoreContextValue>(() => ({ cart, wishlist, hydrated, cartSync, wishlistSync,
    addToCart(productId, quantity = 1) { if (!uuid.test(productId) || !Number.isSafeInteger(quantity)) return; cartRevision.current += 1; setCart((items) => normalizeCartItems([...items, { productId, quantity }])); },
    updateQuantity(productId, quantity) { if (!Number.isSafeInteger(quantity)) return; cartRevision.current += 1; setCart((items) => quantity < 1 ? items.filter((item) => item.productId !== productId) : normalizeCartItems(items.map((item) => item.productId === productId ? { ...item, quantity } : item))); },
    removeFromCart(productId) { cartRevision.current += 1; setCart((items) => items.filter((item) => item.productId !== productId)); },
    clearCart() { cartRevision.current += 1; setCart([]); },
    toggleWishlist(productId) { if (!uuid.test(productId)) return; wishlistRevision.current += 1; setWishlist((items) => items.includes(productId) ? items.filter((id) => id !== productId) : normalizeWishlistItems([...items, productId])); },
  }), [cart, wishlist, hydrated, cartSync, wishlistSync]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
export function useStore() { const value = useContext(StoreContext); if (!value) throw new Error("useStore must be used within StoreProvider"); return value; }
