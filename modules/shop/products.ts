import "server-only";
import { revalidateTag } from "next/cache";
import { db, must } from "@/modules/core/db";
import { AppError, dbError } from "@/modules/core/errors";
import { logActivity } from "@/modules/core/activity";
import { getSettings } from "@/modules/settings/repo";
import { CATALOG_TAG } from "./catalog";
import { isOwnedImagePath } from "./images";
import { removeImage, type UploadedImage } from "./media";
import { PRODUCT_STATUS_LABELS, type Fulfillment, type ImageRow, type ProductRow, type ProductStatus } from "./types";

export type ProductInput = {
  id?: string | null;
  expectedUpdatedAt?: string | null;
  title: string;
  description: string | null;
  categoryId: string | null;
  size: string | null;
  color: string | null;
  priceCents: number;
  offerPriceCents: number | null;
  offerStartsAt: Date | null;
  offerEndsAt: Date | null;
  vipPriceCents: number | null;
  isUnique: boolean;
  fulfillment: Fulfillment;
  status: ProductStatus;
  isFeatured: boolean;
  sortOrder: number;
  internalNotes: string | null;
  images: UploadedImage[];
};

export async function getProduct(id: string): Promise<{ product: ProductRow; images: ImageRow[] }> {
  const product = await must<ProductRow | null>(db().from("shop_products").select("*").eq("id", id).maybeSingle(), "get_product");
  if (!product) throw new AppError("product_not_found", "Ese producto no existe.", 404);
  const images = await must<ImageRow[]>(db().from("shop_product_images").select("*").eq("product_id", id).order("is_primary", { ascending: false }).order("sort_order"), "get_product_images");
  return { product, images };
}

function statusDates(previous: ProductRow | null, next: ProductStatus, soldVisibleDays: number, now = new Date()) {
  const iso = now.toISOString();
  const patch: Partial<ProductRow> = {};
  if ((next === "available" || next === "reserved") && !previous?.published_at) patch.published_at = iso;
  patch.reserved_at = next === "reserved" ? (previous?.status === "reserved" ? previous.reserved_at : iso) : null;
  if (next === "sold") {
    if (previous?.status !== "sold") {
      patch.sold_at = iso;
      patch.sold_visible_until = new Date(now.getTime() + soldVisibleDays * 86_400_000).toISOString();
    }
  } else {
    patch.sold_at = null;
    patch.sold_visible_until = null;
  }
  patch.archived_at = next === "archived" ? (previous?.archived_at ?? iso) : null;
  return patch;
}

export async function saveProduct(input: ProductInput): Promise<string> {
  const title = input.title.trim();
  if (!title) throw new AppError("title_required", "Ponle un título al producto.");
  if (input.offerPriceCents !== null && input.offerPriceCents >= input.priceCents) throw new AppError("offer_price", "El precio de oferta tiene que ser menor que el precio normal.");
  if (input.offerStartsAt && input.offerEndsAt && input.offerEndsAt <= input.offerStartsAt) throw new AppError("offer_dates", "La oferta tiene que terminar después de empezar.");
  if (input.vipPriceCents !== null && input.vipPriceCents > input.priceCents) throw new AppError("vip_price", "El precio VIP no puede ser mayor que el precio normal.");
  if (input.images.length > 12) throw new AppError("too_many_images", "Como máximo 12 fotos por producto.");
  for (const image of input.images) if (!isOwnedImagePath(image.path)) throw new AppError("bad_image", "Una de las fotos no es válida. Vuelve a subirla.");

  const shop = await getSettings("shop");
  const previous = input.id ? (await getProduct(input.id)).product : null;
  const row = {
    title,
    description: input.description?.trim() || null,
    category_id: input.categoryId,
    size: input.size?.trim() || null,
    color: input.color?.trim() || null,
    price_cents: input.priceCents,
    offer_price_cents: input.offerPriceCents,
    offer_starts_at: input.offerPriceCents === null ? null : input.offerStartsAt?.toISOString() ?? null,
    offer_ends_at: input.offerPriceCents === null ? null : input.offerEndsAt?.toISOString() ?? null,
    vip_price_cents: input.vipPriceCents,
    is_unique: input.isUnique,
    fulfillment: input.fulfillment,
    status: input.status,
    is_featured: input.isFeatured,
    sort_order: input.sortOrder,
    internal_notes: input.internalNotes?.trim() || null,
    ...statusDates(previous, input.status, shop.soldVisibleDays),
  };

  let id: string;
  if (previous) {
    let query = db().from("shop_products").update(row).eq("id", previous.id);
    if (input.expectedUpdatedAt) query = query.eq("updated_at", input.expectedUpdatedAt);
    const { data, error } = await query.select("id").maybeSingle();
    if (error) throw dbError(error, "update_product");
    if (!data) throw new AppError("conflict", "Alguien ha modificado este producto mientras lo editabas. Recarga la página y vuelve a guardar.", 409);
    id = previous.id;
  } else {
    const { data, error } = await db().from("shop_products").insert(row).select("id").single();
    if (error) throw dbError(error, "insert_product");
    id = data.id as string;
  }

  await syncImages(id, input.images);
  revalidateTag(CATALOG_TAG);
  await logActivity({
    actor: "admin",
    action: previous ? "product_updated" : "product_created",
    summary: `${previous ? "Producto editado" : "Producto creado"}: «${title}» (${PRODUCT_STATUS_LABELS[input.status]})`,
    data: { product_id: id },
  });
  return id;
}

async function syncImages(productId: string, images: UploadedImage[]) {
  const current = await must<ImageRow[]>(db().from("shop_product_images").select("*").eq("product_id", productId), "sync_images_read");
  const wanted = new Set(images.map((i) => i.path));
  const removed = current.filter((row) => !wanted.has(row.storage_path));
  if (removed.length) {
    await must(db().from("shop_product_images").delete().in("id", removed.map((r) => r.id)), "sync_images_delete");
    for (const row of removed) await removeImage(row.storage_path);
  }
  if (images.length === 0) return;
  await must(db().from("shop_product_images").update({ is_primary: false }).eq("product_id", productId), "sync_images_reset_primary");
  const rows = images.map((image, index) => ({
    product_id: productId,
    storage_path: image.path,
    public_url: image.url,
    width: image.width,
    height: image.height,
    is_primary: index === 0,
    sort_order: index * 10,
  }));
  await must(db().from("shop_product_images").upsert(rows, { onConflict: "storage_path" }), "sync_images_upsert");
}

export async function setProductStatus(id: string, status: ProductStatus) {
  const { product } = await getProduct(id);
  if (product.status === status) return;
  const shop = await getSettings("shop");
  await must(db().from("shop_products").update({ status, ...statusDates(product, status, shop.soldVisibleDays) }).eq("id", id), "set_product_status");
  revalidateTag(CATALOG_TAG);
  await logActivity({ actor: "admin", action: "product_status", summary: `«${product.title}» ahora está ${PRODUCT_STATUS_LABELS[status].toLowerCase()}`, data: { product_id: id } });
}

/** Copia un producto (sin fotos) como borrador: útil para piezas parecidas. */
export async function duplicateProduct(id: string): Promise<string> {
  const { product } = await getProduct(id);
  const { data, error } = await db().from("shop_products").insert({
    title: `${product.title} (copia)`.slice(0, 120),
    description: product.description,
    category_id: product.category_id,
    size: product.size,
    color: product.color,
    price_cents: product.price_cents,
    vip_price_cents: product.vip_price_cents,
    is_unique: product.is_unique,
    fulfillment: product.fulfillment,
    status: "draft",
    sort_order: product.sort_order,
  }).select("id").single();
  if (error) throw dbError(error, "duplicate_product");
  await logActivity({ actor: "admin", action: "product_duplicated", summary: `Producto duplicado: «${product.title}»`, data: { product_id: data.id } });
  return data.id as string;
}

export type ProductListRow = ProductRow & { primary_image: string | null; category_name: string | null; open_interests: number };

export async function listProducts(params: { search?: string; status?: ProductStatus | "active" | "all"; categoryId?: string; page?: number; pageSize?: number }) {
  const pageSize = params.pageSize ?? 24;
  const page = Math.max(1, params.page ?? 1);
  let query = db()
    .from("shop_products")
    .select("*, shop_categories(name), shop_product_images(public_url, is_primary, sort_order)", { count: "exact" })
    .order("updated_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  const status = params.status ?? "active";
  if (status === "active") query = query.neq("status", "archived");
  else if (status !== "all") query = query.eq("status", status);
  if (params.categoryId) query = query.eq("category_id", params.categoryId);
  if (params.search?.trim()) query = query.ilike("title", `%${params.search.trim().replace(/[%_]/g, "")}%`);
  const { data, error, count } = await query;
  if (error) throw dbError(error, "list_products");
  const ids = (data ?? []).map((p) => p.id as string);
  const interests = ids.length
    ? await db().from("shop_interests").select("product_id").in("product_id", ids).eq("status", "new")
    : { data: [] as Array<{ product_id: string }> };
  const counts = new Map<string, number>();
  for (const row of interests.data ?? []) counts.set(row.product_id as string, (counts.get(row.product_id as string) ?? 0) + 1);
  const rows: ProductListRow[] = (data ?? []).map((p) => {
    const images = ((p.shop_product_images ?? []) as Array<{ public_url: string; is_primary: boolean; sort_order: number }>).sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order);
    const { shop_categories, shop_product_images, ...rest } = p as ProductRow & { shop_categories: { name: string } | null; shop_product_images: unknown };
    void shop_product_images;
    return { ...(rest as ProductRow), primary_image: images[0]?.public_url ?? null, category_name: shop_categories?.name ?? null, open_interests: counts.get(p.id as string) ?? 0 };
  });
  return { rows, total: count ?? 0, page, pageSize };
}
