import type { Metadata } from "next";
import { ProductDetailClient } from "@/components/product/product-detail-client";
import { seedProducts } from "@/lib/data/products";

export function generateStaticParams(){return seedProducts.map((p)=>({slug:p.slug}))}
export async function generateMetadata({params}:{params:Promise<{slug:string}>}):Promise<Metadata>{const {slug}=await params;const p=seedProducts.find((x)=>x.slug===slug);return {title:p?.name??"Product",description:p?.description}}
export default async function ProductPage({params}:{params:Promise<{slug:string}>}){const {slug}=await params;return <ProductDetailClient slug={slug}/>}
