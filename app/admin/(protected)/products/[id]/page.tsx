import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/admin";
import { uuidPattern } from "@/lib/validation/catalog";
export default async function ProductPreview({ params }: { params: Promise<{ id: string }> }) {
  const { supabase } = await requireAdmin();
  const { id } = await params;
  if (!uuidPattern.test(id)) notFound();
  const { data: product, error } = await supabase.from("products").select("*, categories(name,active), product_images(sort_order,is_primary,media_assets(secure_url,alt,width,height))").eq("id", id).maybeSingle();
  if (error) throw new Error("Product could not be loaded.");
  if (!product) notFound();
  return <div className="admin-content admin-preview"><p className="section-note">Admin preview · {product.status}</p><h1>{product.name}</h1>
    <p>{product.categories?.name}{!product.categories?.active && " (inactive category: hidden from public catalog)"}</p>
    <p>{product.price === null ? "Request a quote" : `${product.currency} ${product.price}`}</p>
    <p className="catalog-description">{product.description}</p><dl>{Object.entries(product.attributes ?? {}).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{typeof value === "string" ? value : JSON.stringify(value)}</dd></div>)}</dl>
    <div className="catalog-preview-images">{product.product_images.sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order).map((image, index) => image.media_assets && <figure key={index}>
      {/* Verified Cloudinary URLs; native image avoids changing global optimizer configuration. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image.media_assets.secure_url} alt={image.media_assets.alt} width={image.media_assets.width} height={image.media_assets.height}/>
      {image.is_primary && <figcaption>Primary image</figcaption>}</figure>)}</div>
    <p>URL slug: {product.slug} · Version {product.version}</p><p>SEO title: {product.seo_title || product.name}<br/>SEO description: {product.seo_description || "Not set"}</p>
    <Link className="btn btn-primary" href={`/admin/products?edit=${id}`}>Edit product</Link> <Link className="text-link" href="/admin/products">Back to products</Link>
  </div>;
}
