import "server-only";
import { db } from "@/modules/core/db";
import { getSettings } from "@/modules/settings/repo";
import { MEDIA_BUCKET, isOwnedImagePath, removeOwnedImage, type MediaFolder, uploadValidatedImage, validateImageFile } from "./images";

export type UploadedImage = { path: string; url: string; width: number; height: number };

/** Valida (firma real, tamaño y dimensiones) y sube una imagen al bucket público. */
export async function uploadImage(file: FormDataEntryValue | null, folder: MediaFolder): Promise<UploadedImage> {
  const image = await validateImageFile(file);
  if (!image) throw new Error("No se recibió ninguna imagen.");
  const { storagePath, publicUrl } = await uploadValidatedImage(db(), folder, image);
  return { path: storagePath, url: publicUrl, width: image.width, height: image.height };
}

export async function removeImage(path: string | null | undefined) {
  if (!path || !isOwnedImagePath(path)) return;
  try {
    await removeOwnedImage(db(), path);
  } catch (error) {
    // Si falla, la limpieza automática de huérfanos lo recogerá.
    console.error("remove_image_failed", path, error);
  }
}

/**
 * Borra del almacenamiento las imágenes subidas que ningún producto, categoría
 * ni logo usa desde hace más de 24 h (p. ej. fotos subidas en un formulario
 * que al final no se guardó).
 */
export async function cleanupOrphanMedia(): Promise<{ removed: number }> {
  const [images, categories, brand] = await Promise.all([
    db().from("shop_product_images").select("storage_path").limit(20_000),
    db().from("shop_categories").select("image_path").not("image_path", "is", null).limit(1_000),
    getSettings("brand"),
  ]);
  if (images.error || categories.error) throw new Error("cleanup_media_read_failed");
  const referenced = new Set<string>([
    ...(images.data ?? []).map((r) => r.storage_path as string),
    ...(categories.data ?? []).map((r) => r.image_path as string),
    ...(brand.logoPath ? [brand.logoPath] : []),
  ]);
  const cutoff = Date.now() - 24 * 3_600_000;
  const orphans: string[] = [];
  for (const folder of ["products", "categories", "brand"] as const) {
    const { data, error } = await db().storage.from(MEDIA_BUCKET).list(`shop/${folder}`, { limit: 1000, sortBy: { column: "created_at", order: "asc" } });
    if (error) continue;
    for (const object of data ?? []) {
      const path = `shop/${folder}/${object.name}`;
      const created = object.created_at ? new Date(object.created_at).getTime() : Date.now();
      if (isOwnedImagePath(path) && !referenced.has(path) && created < cutoff) orphans.push(path);
    }
  }
  for (let i = 0; i < orphans.length; i += 100) {
    await db().storage.from(MEDIA_BUCKET).remove(orphans.slice(i, i + 100));
  }
  return { removed: orphans.length };
}
