import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "@/modules/core/db";
import { computePrice } from "./pricing";
import type { CategoryRow, ImageRow, ProductRow, PublicCategory, PublicProduct } from "./types";

export const CATALOG_TAG = "catalog";

type RawCatalog = { categories: CategoryRow[]; products: ProductRow[]; images: ImageRow[] };

/**
 * Catálogo público en bruto (con caché de 60 s que el panel invalida al
 * guardar). Los precios se calculan después, por cliente y al momento.
 */
const loadRawCatalog = unstable_cache(
  async (): Promise<RawCatalog> => {
    const [categories, products] = await Promise.all([
      db().from("shop_categories").select("id, slug, name, description, image_path, image_url, status, sort_order").eq("status", "visible").order("sort_order").limit(100),
      db().from("shop_products").select("*").in("status", ["available", "reserved", "sold"]).order("is_featured", { ascending: false }).order("sort_order").order("created_at", { ascending: false }).limit(500),
    ]);
    if (categories.error) throw new Error(`catalog_categories: ${categories.error.message}`);
    if (products.error) throw new Error(`catalog_products: ${products.error.message}`);
    const ids = (products.data ?? []).map((p) => p.id as string);
    const images = ids.length
      ? await db().from("shop_product_images").select("id, product_id, storage_path, public_url, width, height, is_primary, sort_order").in("product_id", ids).order("is_primary", { ascending: false }).order("sort_order").limit(3000)
      : { data: [], error: null };
    if (images.error) throw new Error(`catalog_images: ${images.error.message}`);
    return { categories: (categories.data ?? []) as CategoryRow[], products: (products.data ?? []) as ProductRow[], images: (images.data ?? []) as ImageRow[] };
  },
  ["public-catalog-v1"],
  { tags: [CATALOG_TAG], revalidate: 60 },
);

export function isPubliclyVisible(product: Pick<ProductRow, "status" | "sold_visible_until" | "category_id">, visibleCategoryIds: Set<string>, now = new Date()): boolean {
  if (product.category_id && !visibleCategoryIds.has(product.category_id)) return false;
  if (product.status === "available" || product.status === "reserved") return true;
  if (product.status === "sold") return Boolean(product.sold_visible_until && new Date(product.sold_visible_until).getTime() > now.getTime());
  return false;
}

export async function publicCatalog(options: { isVip: boolean; vipDiscountPercent: number; now?: Date }): Promise<{ categories: PublicCategory[]; products: PublicProduct[] }> {
  const raw = await loadRawCatalog();
  const now = options.now ?? new Date();
  const visibleCategoryIds = new Set(raw.categories.map((c) => c.id));
  const imagesByProduct = new Map<string, ImageRow[]>();
  for (const image of raw.images) {
    const list = imagesByProduct.get(image.product_id) ?? [];
    list.push(image);
    imagesByProduct.set(image.product_id, list);
  }
  const products = raw.products
    .filter((p) => isPubliclyVisible(p, visibleCategoryIds, now))
    .map((p): PublicProduct => {
      const price = computePrice(p, { isVip: options.isVip, vipDiscountPercent: options.vipDiscountPercent, now });
      return {
        id: p.id,
        categoryId: p.category_id,
        title: p.title,
        description: p.description,
        size: p.size,
        color: p.color,
        isUnique: p.is_unique,
        fulfillment: p.fulfillment,
        status: p.status as PublicProduct["status"],
        isFeatured: p.is_featured,
        images: (imagesByProduct.get(p.id) ?? []).map((i) => ({ url: i.public_url, width: i.width, height: i.height })),
        price: {
          finalCents: price.finalCents,
          compareAtCents: price.compareAtCents,
          vipCents: price.vipCents,
          offerActive: price.offerActive,
          offerEndsAt: price.offerEndsAt,
          vipAdvantage: price.vipAdvantage,
          isVipPrice: price.isVipPrice,
        },
      };
    })
    // Lo vendido va al final para que no tape lo disponible.
    .sort((a, b) => Number(a.status === "sold") - Number(b.status === "sold"));
  const usedCategories = new Set(products.map((p) => p.categoryId));
  const categories = raw.categories
    .filter((c) => usedCategories.has(c.id))
    .map((c) => ({ id: c.id, slug: c.slug, name: c.name, description: c.description, imageUrl: c.image_url }));
  return { categories, products };
}
