import { seedProducts } from "@/lib/data/products";
import type { Product } from "@/lib/types";

export interface ProductRepository {
  list(): Product[];
  save(products: Product[]): void;
  reset(): Product[];
}

const STORAGE_KEY = "aven-furniture-products-v1";

export class LocalProductRepository implements ProductRepository {
  list(): Product[] {
    if (typeof window === "undefined") return seedProducts;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      this.save(seedProducts);
      return seedProducts;
    }
    try { return JSON.parse(saved) as Product[]; } catch { return this.reset(); }
  }
  save(products: Product[]) {
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
  }
  reset() {
    this.save(seedProducts);
    return seedProducts;
  }
}
