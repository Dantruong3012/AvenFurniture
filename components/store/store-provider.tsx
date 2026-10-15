"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { CartItem } from "@/lib/types";

interface StoreContextValue {
  cart: CartItem[]; wishlist: string[]; hydrated: boolean;
  addToCart: (productId: string, quantity?: number) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;
  toggleWishlist: (productId: string) => void;
}
const StoreContext = createContext<StoreContextValue | null>(null);
const CART_KEY = "aven-furniture-cart-v1";
const WISHLIST_KEY = "aven-furniture-wishlist-v1";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function readStored(key: string): unknown { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; } }

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const storedCart = readStored(CART_KEY);
    const storedWishlist = readStored(WISHLIST_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCart(Array.isArray(storedCart) ? storedCart.filter((item) => item && typeof item.productId === "string" && uuid.test(item.productId) && Number.isSafeInteger(item.quantity) && item.quantity > 0 && item.quantity <= 999).slice(0, 100) : []);
    setWishlist(Array.isArray(storedWishlist) ? [...new Set(storedWishlist.filter((id) => typeof id === "string" && uuid.test(id)))].slice(0, 100) as string[] : []);
    localStorage.removeItem("aven-furniture-products-v1");
    setHydrated(true);
  }, []);
  useEffect(() => { if (hydrated) localStorage.setItem(CART_KEY, JSON.stringify(cart)); }, [cart, hydrated]);
  useEffect(() => { if (hydrated) localStorage.setItem(WISHLIST_KEY, JSON.stringify(wishlist)); }, [wishlist, hydrated]);
  const value = useMemo<StoreContextValue>(() => ({ cart, wishlist, hydrated,
    addToCart(productId, quantity = 1) { if (!uuid.test(productId)) return; setCart((items) => items.some((item) => item.productId === productId) ? items.map((item) => item.productId === productId ? { ...item, quantity: Math.min(999, item.quantity + quantity) } : item) : [...items, { productId, quantity: Math.min(999, Math.max(1, quantity)) }].slice(0, 100)); },
    updateQuantity(productId, quantity) { setCart((items) => quantity < 1 ? items.filter((item) => item.productId !== productId) : items.map((item) => item.productId === productId ? { ...item, quantity: Math.min(999, quantity) } : item)); },
    removeFromCart(productId) { setCart((items) => items.filter((item) => item.productId !== productId)); },
    clearCart() { setCart([]); },
    toggleWishlist(productId) { if (!uuid.test(productId)) return; setWishlist((items) => items.includes(productId) ? items.filter((id) => id !== productId) : [...items, productId].slice(0, 100)); },
  }), [cart, wishlist, hydrated]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
export function useStore() { const value = useContext(StoreContext); if (!value) throw new Error("useStore must be used within StoreProvider"); return value; }
