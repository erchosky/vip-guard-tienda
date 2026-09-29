"use server";

import { redirect } from "next/navigation";
import { revalidateTag } from "next/cache";
import { adminAction } from "@/modules/admin/action";
import { f } from "@/modules/admin/form";
import type { ActionState } from "@/components/ui/action-form";
import { AppError } from "@/modules/core/errors";
import { logActivity } from "@/modules/core/activity";
import { euros } from "@/modules/core/money";
import { getSettings, saveSettings } from "@/modules/settings/repo";
import { PAYMENT_METHODS, type PaymentMethod } from "@/modules/vip/access";
import { duplicateProduct, saveProduct, setProductStatus } from "@/modules/shop/products";
import { saveCategory } from "@/modules/shop/categories";
import { registerSale, voidSale } from "@/modules/shop/sales";
import { updateInterest, type InterestStatus } from "@/modules/shop/interests";
import { removeImage, type UploadedImage } from "@/modules/shop/media";
import { isOwnedImagePath } from "@/modules/shop/images";
import { CATALOG_TAG } from "@/modules/shop/catalog";
import type { ProductStatus } from "@/modules/shop/types";

const STATUSES = ["draft", "available", "reserved", "sold", "hidden", "archived"] as const satisfies readonly ProductStatus[];
const METHODS = PAYMENT_METHODS.map((m) => m.value) as PaymentMethod[];

function parseImages(form: FormData, key = "images"): UploadedImage[] {
  const list = f.json<UploadedImage[]>(form, key, []);
  if (!Array.isArray(list)) return [];
  return list.filter((i) => i && typeof i.path === "string" && isOwnedImagePath(i.path) && typeof i.url === "string").map((i) => ({ path: i.path, url: i.url, width: Number(i.width) || 0, height: Number(i.height) || 0 }));
}

export async function saveProductAction(_: ActionState, form: FormData) {
  let createdId: string | null = null;
  const isNew = !f.optUuid(form, "id");
  const state = await adminAction(async () => {
    if (form.has("__uploading")) throw new AppError("uploading", "Espera a que terminen de subir las fotos.");
    const onOffer = f.bool(form, "on_offer");
    const id = await saveProduct({
      id: f.optUuid(form, "id"),
      expectedUpdatedAt: f.optStr(form, "updated_at", 64),
      title: f.required(form, "title", "el título", 120),
      description: f.optStr(form, "description", 3000),
      categoryId: f.optUuid(form, "category_id"),
      size: f.optStr(form, "size", 40),
      color: f.optStr(form, "color", 40),
      priceCents: f.requiredMoney(form, "price", "el precio"),
      offerPriceCents: onOffer ? f.requiredMoney(form, "offer_price", "el precio de oferta") : null,
      offerStartsAt: onOffer ? f.date(form, "offer_starts_at") : null,
      offerEndsAt: onOffer ? f.date(form, "offer_ends_at") : null,
      vipPriceCents: f.money(form, "vip_price", "el precio VIP"),
      isUnique: f.bool(form, "is_unique"),
      fulfillment: f.oneOf(form, "fulfillment", ["physical", "digital"] as const, "physical"),
      status: f.oneOf(form, "status", STATUSES, "draft"),
      isFeatured: f.bool(form, "is_featured"),
      sortOrder: f.int(form, "sort_order", 100, 0, 100000),
      internalNotes: f.optStr(form, "internal_notes", 2000),
      images: parseImages(form),
    });
    createdId = id;
    return "Producto guardado.";
  });
  if (state.ok && createdId) redirect(`/admin/tienda/productos/${createdId}?${isNew ? "nuevo" : "guardado"}=${Date.now()}`);
  return state;
}

export async function productStatusAction(_: ActionState, form: FormData) {
  return adminAction(async () => {
    await setProductStatus(f.uuid(form, "id"), f.oneOf(form, "status", STATUSES));
    return "Estado cambiado.";
  });
}

export async function duplicateProductAction(_: ActionState, form: FormData) {
  let newId: string | null = null;
  const state = await adminAction(async () => {
    newId = await duplicateProduct(f.uuid(form, "id"));
  });
  if (state.ok && newId) redirect(`/admin/tienda/productos/${newId}?copia=1`);
  return state;
}

export async function saveCategoryAction(_: ActionState, form: FormData) {
  return adminAction(async () => {
    const images = parseImages(form, "image");
    await saveCategory({
      id: f.optUuid(form, "id"),
      name: f.required(form, "name", "el nombre", 60),
      description: f.optStr(form, "description", 300),
      status: f.oneOf(form, "status", ["visible", "hidden", "archived"] as const, "visible"),
      sortOrder: f.int(form, "sort_order", 100, 0, 100000),
      image: images[0] ?? null,
      removeImage: f.bool(form, "remove_image"),
    });
    return "Categoría guardada.";
  });
}

export async function registerSaleAction(_: ActionState, form: FormData) {
  return adminAction(async () => {
    const customerId = f.optUuid(form, "customerId");
    const buyerLabel = f.optStr(form, "buyerLabel", 120);
    if (!customerId && !buyerLabel) throw new AppError("buyer", "Elige el cliente o escribe quién es el comprador.");
    const amount = f.requiredMoney(form, "amount", "el importe");
    await registerSale({
      productId: f.uuid(form, "productId", "el producto"),
      customerId,
      buyerLabel,
      amountCents: amount,
      shippingCents: f.money(form, "shipping", "el envío") ?? 0,
      method: f.oneOf(form, "method", METHODS),
      note: f.optStr(form, "note", 500),
    });
    return `Venta registrada: ${euros(amount)}.`;
  });
}

export async function voidSaleAction(_: ActionState, form: FormData) {
  return adminAction(async () => {
    await voidSale(f.uuid(form, "saleId"), f.str(form, "reason", 300));
    return "Venta anulada.";
  });
}

export async function updateInterestAction(_: ActionState, form: FormData) {
  return adminAction(async () => {
    const patch: { status?: InterestStatus; admin_note?: string | null } = {};
    const status = f.str(form, "status");
    if (status) patch.status = f.oneOf(form, "status", ["new", "contacted", "sold", "discarded"] as const);
    if (form.has("admin_note")) patch.admin_note = f.optStr(form, "admin_note", 1000);
    await updateInterest(f.uuid(form, "id"), patch);
    return "Actualizado.";
  });
}

export async function saveBrandAction(_: ActionState, form: FormData) {
  return adminAction(async () => {
    const current = await getSettings("brand");
    const logo = parseImages(form, "logo")[0] ?? null;
    const removeLogo = f.bool(form, "remove_logo");
    const next = await saveSettings("brand", {
      name: f.required(form, "name", "el nombre", 40),
      tagline: f.str(form, "tagline", 120),
      contactUsername: f.str(form, "contactUsername", 60),
      ...(logo ? { logoPath: logo.path, logoUrl: logo.url } : removeLogo ? { logoPath: null, logoUrl: null } : {}),
    });
    if ((logo || removeLogo) && current.logoPath && current.logoPath !== next.logoPath) await removeImage(current.logoPath);
    revalidateTag(CATALOG_TAG);
    await logActivity({ actor: "admin", action: "brand_saved", summary: "Marca y contacto actualizados" });
    return "Guardado.";
  });
}

export async function saveShopSettingsAction(_: ActionState, form: FormData) {
  return adminAction(async () => {
    await saveSettings("shop", {
      vipDiscountPercent: f.int(form, "vipDiscountPercent", 0, 0, 90),
      soldVisibleDays: f.int(form, "soldVisibleDays", 3, 0, 60),
    });
    revalidateTag(CATALOG_TAG);
    await logActivity({ actor: "admin", action: "shop_settings", summary: "Ajustes de la tienda actualizados" });
    return "Ajustes guardados.";
  });
}
