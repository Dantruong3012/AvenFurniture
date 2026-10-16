export interface CartItem {
  productId: string;
  quantity: number;
}

export type StorefrontInquirySource = "cart" | "product" | "contact";

export type InquiryConfirmation = {
  success: true;
  id: string;
  reference: number;
  is_duplicate: boolean;
};

export interface Collection {
  name: string;
  slug: string;
  description: string;
  image: string;
}
