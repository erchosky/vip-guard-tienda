import "server-only";
import { revalidateTag } from "next/cache";
import { db, must } from "@/modules/core/db";
import { AppError, dbError } from "@/modules/core/errors";
import { logActivity } from "@/modules/core/activity";
import { CATALOG_TAG } from "./catalog";
import { removeImage, type UploadedImage } from "./media";
import type { CategoryRow } from "./types";

export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "categoria";
}

export async function listCategories(includeArchived = false): Promise<Array<CategoryRow & { products: number }>> {
  let query = db().from("shop_categories").select("*, shop_products(count)").order("sort_order").order("name");
  if (!includeArchived) query = query.neq("status", "archived");
  const data = await must<Array<CategoryRow & { shop_products: Array<{ count: number }> }>>(query, "list_categories");
  return data.map(({ shop_products, ...c }) => ({ ...c, products: shop_products?.[0]?.count ?? 0 }));
}

export async function saveCategory(input: {
  id?: string | null;
  name: string;
  description: string | null;
  status: CategoryRow["status"];
  sortOrder: number;
  image?: UploadedImage | null;
  removeImage?: boolean;
}) {
  const name = input.name.trim();
  if (!name) throw new AppError("name_required", "Ponle un nombre a la categoría.");
  const previous = input.id
    ? await must<CategoryRow | null>(db().from("shop_categories").select("*").eq("id", input.id).maybeSingle(), "get_category")
    : null;
  const row: Record<string, unknown> = { name, description: input.description?.trim() || null, status: input.status, sort_order: input.sortOrder };
  if (input.image) {
    row.image_path = input.image.path;
    row.image_url = input.image.url;
  } else if (input.removeImage) {
    row.image_path = null;
    row.image_url = null;
  }
  if (previous) {
    const { error } = await db().from("shop_categories").update(row).eq("id", previous.id);
    if (error) throw dbError(error, "update_category");
    if ((input.image || input.removeImage) && previous.image_path) await removeImage(previous.image_path);
  } else {
    let slug = slugify(name);
    const { data: clash } = await db().from("shop_categories").select("id").eq("slug", slug).maybeSingle();
    if (clash) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
    const { error } = await db().from("shop_categories").insert({ ...row, slug });
    if (error) throw dbError(error, "insert_category");
  }
  revalidateTag(CATALOG_TAG);
  await logActivity({ actor: "admin", action: previous ? "category_updated" : "category_created", summary: `${previous ? "Categoría editada" : "Categoría creada"}: «${name}»` });
}
