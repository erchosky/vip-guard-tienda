import "server-only";
import { revalidateTag } from "next/cache";
import { db, must } from "@/modules/core/db";
import { dbError, AppError } from "@/modules/core/errors";
import { logActivity } from "@/modules/core/activity";
import { euros } from "@/modules/core/money";
import type { PaymentMethod } from "@/modules/vip/access";
import { CATALOG_TAG } from "./catalog";

export async function registerSale(input: {
  productId: string;
  customerId: string | null;
  buyerLabel?: string | null;
  amountCents: number;
  shippingCents?: number | null;
  method: PaymentMethod;
  note?: string | null;
}) {
  if (!Number.isInteger(input.amountCents) || input.amountCents < 0) throw new AppError("invalid_amount", "El importe no es válido.");
  const { data, error } = await db().rpc("shop_register_sale", {
    p_product_id: input.productId,
    p_customer_id: input.customerId,
    p_amount_cents: input.amountCents,
    p_method: input.method,
    p_shipping_cents: input.shippingCents ?? 0,
    p_buyer_label: input.buyerLabel ?? null,
    p_note: input.note ?? null,
  });
  if (error) throw dbError(error, "register_sale");
  revalidateTag(CATALOG_TAG);
  const product = await must<{ title: string } | null>(db().from("shop_products").select("title").eq("id", input.productId).maybeSingle(), "sale_product");
  await logActivity({
    actor: "admin",
    action: "shop_sale",
    customerId: input.customerId,
    summary: `Venta de «${product?.title ?? "producto"}» por ${euros(input.amountCents)}${input.shippingCents ? ` + ${euros(input.shippingCents)} de envío` : ""} (${input.method})`,
    data: { sale_id: data },
  });
  return data as string;
}

export async function voidSale(saleId: string, reason: string) {
  const { data, error } = await db().rpc("shop_void_sale", { p_sale_id: saleId, p_reason: reason });
  if (error) throw dbError(error, "void_sale");
  if (!data) throw new AppError("not_voidable", "Esa venta ya estaba anulada.");
  revalidateTag(CATALOG_TAG);
  await logActivity({ actor: "admin", action: "shop_sale_voided", summary: `Venta anulada: ${reason || "sin motivo"}`, data: { sale_id: saleId } });
}
