import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/admin";
import { uuidPattern } from "@/lib/validation/catalog";
import { getI18n } from "@/lib/i18n/server";

export default async function ProductPreview({ params }: { params: Promise<{ id: string }> }) {
  const { t } = await getI18n();

  const { supabase } = await requireAdmin();
  const { id } = await params;
  if (!uuidPattern.test(id)) notFound();
  const { data: product, error } = await supabase.from("products").select("*, categories(name,active), product_images(sort_order,is_primary,media_assets(secure_url,alt,width,height))").eq("id", id).maybeSingle();
  if (error) throw new Error("Product could not be loaded.");
  if (!product) notFound();
  return <div className="admin-content admin-preview"><p className="section-note">{t("Admin preview ·")}{" "}{t(product.status ?? "")}</p><h1>{product.name}</h1>
    <p>{product.categories?.name}{!product.categories?.active && t(" (inactive category: hidden from public catalog)")}</p>
    <p>{product.price === null ? t("Request a quote") : `${product.currency} ${product.price}`}</p>
    <p className="catalog-description">{product.description}</p><dl>{Object.entries(product.attributes ?? {}).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{typeof value === "string" ? value : JSON.stringify(value)}</dd></div>)}</dl>
    <div className="catalog-preview-images">{product.product_images.sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order).map((image, index) => image.media_assets && <figure key={index}>
      {/* Verified Cloudinary URLs; native image avoids changing global optimizer configuration. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image.media_assets.secure_url} alt={image.media_assets.alt} width={image.media_assets.width} height={image.media_assets.height}/>
      {image.is_primary && <figcaption>{t("Primary image")}</figcaption>}</figure>)}</div>
    <p>{t("URL slug:")}{" "}{product.slug}{" "}{t("· Version")}{" "}{product.version}</p><p>{t("SEO title:")}{" "}{product.seo_title || product.name}<br/>{t("SEO description:")}{" "}{product.seo_description || t("Not set")}</p>
    <Link className="btn btn-primary" href={`/admin/products?edit=${id}`}>{t("Edit product")}</Link> <Link className="text-link" href="/admin/products">{t("Back to products")}</Link>
  </div>;
}
