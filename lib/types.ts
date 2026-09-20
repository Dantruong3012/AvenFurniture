export type ProductStatus = "active" | "draft";

export interface Product {
  id: string;
  name: string;
  slug: string;
  category: string;
  collection: string;
  description: string;
  price: number;
  compareAtPrice?: number;
  material: string;
  color: string;
  dimensions: string;
  stock: number;
  featured: boolean;
  status: ProductStatus;
  image: string;
  gallery: string[];
  badge?: string;
}

export interface CartItem {
  productId: string;
  quantity: number;
}

export interface Collection {
  name: string;
  slug: string;
  description: string;
  image: string;
}
