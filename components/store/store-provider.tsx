"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { LocalProductRepository } from "@/lib/repositories/productRepository";
import { seedProducts } from "@/lib/data/products";
import type { CartItem, Product } from "@/lib/types";

interface StoreContextValue {
  products: Product[];
  cart: CartItem[];
  wishlist: string[];
  hydrated: boolean;
  addToCart: (productId: string, quantity?: number) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;
  toggleWishlist: (productId: string) => void;
  upsertProduct: (product: Product) => void;
  deleteProduct: (productId: string) => void;
  resetProducts: () => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);
const repository = new LocalProductRepository();
const CART_KEY = "aven-furniture-cart-v1";
const WISHLIST_KEY = "aven-furniture-wishlist-v1";

function readStored<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch { return fallback; }
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState<Product[]>(seedProducts);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    /* Client persistence is intentionally restored only after the server-safe seed render. */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProducts(repository.list());
    setCart(readStored(CART_KEY, []));
    setWishlist(readStored(WISHLIST_KEY, []));
    setHydrated(true);
  }, []);

  useEffect(() => { if (hydrated) window.localStorage.setItem(CART_KEY, JSON.stringify(cart)); }, [cart, hydrated]);
  useEffect(() => { if (hydrated) window.localStorage.setItem(WISHLIST_KEY, JSON.stringify(wishlist)); }, [wishlist, hydrated]);

  const value = useMemo<StoreContextValue>(() => ({
    products,
    cart,
    wishlist,
    hydrated,
    addToCart(productId, quantity = 1) {
      setCart((items) => items.some((item) => item.productId === productId)
        ? items.map((item) => item.productId === productId ? { ...item, quantity: item.quantity + quantity } : item)
        : [...items, { productId, quantity }]);
    },
    updateQuantity(productId, quantity) { setCart((items) => quantity < 1 ? items.filter((item) => item.productId !== productId) : items.map((item) => item.productId === productId ? { ...item, quantity } : item)); },
    removeFromCart(productId) { setCart((items) => items.filter((item) => item.productId !== productId)); },
    clearCart() { setCart([]); },
    toggleWishlist(productId) { setWishlist((items) => items.includes(productId) ? items.filter((id) => id !== productId) : [...items, productId]); },
    upsertProduct(product) {
      setProducts((items) => {
        const next = items.some((item) => item.id === product.id) ? items.map((item) => item.id === product.id ? product : item) : [product, ...items];
        repository.save(next); return next;
      });
    },
    deleteProduct(productId) { setProducts((items) => { const next = items.filter((item) => item.id !== productId); repository.save(next); return next; }); },
    resetProducts() { const next = repository.reset(); setProducts(next); },
  }), [products, cart, wishlist, hydrated]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useStore must be used within StoreProvider");
  return context;
}
