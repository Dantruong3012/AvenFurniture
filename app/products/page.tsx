import type { Metadata } from "next";
import { Suspense } from "react";
import { CatalogClient } from "@/components/product/catalog-client";

export const metadata: Metadata = { title: "Shop", description: "Explore the complete AvenFurniture collection." };
export default function ProductsPage(){return <><header className="page-hero"><div className="container"><p className="section-note">The complete collection</p><h1>Furniture for<br/>considered living</h1><p>Designed to work together, distinct enough to stand alone.</p></div></header><Suspense><CatalogClient/></Suspense></>}
