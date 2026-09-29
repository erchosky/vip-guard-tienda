import "server-only";
import { db, must } from "@/modules/core/db";
import { dbError, AppError } from "@/modules/core/errors";
import { logActivity } from "@/modules/core/activity";
import { appUrl } from "@/modules/core/env";
import { eurosShort } from "@/modules/core/money";
import { chatLink, displayName } from "@/modules/telegram/links";
import { keyboard } from "@/modules/telegram/keyboard";
import { getSettings } from "@/modules/settings/repo";
import type { Customer } from "@/modules/customers/repo";
import { messageContext } from "@/modules/vip/context";
import { notifyAdmin } from "@/modules/vip/notify-admin";
import { vipStatus } from "@/modules/vip/state";
import { getSubscription } from "@/modules/vip/repo";
import { computePrice } from "./pricing";
import type { ProductRow } from "./types";

export type InterestStatus = "new" | "contacted" | "sold" | "discarded";
export const INTEREST_STATUS_LABELS: Record<InterestStatus, string> = {
  new: "Nuevo",
  contacted: "Contactado",
  sold: "Vendido",
  discarded: "Descartado",
};

/**
 * El cliente pulsa «Me interesa»:
 *  1. Se guarda el interés (con el precio que vio).
 *  2. Se genera el mensaje con la plantilla y los datos de ESE producto.
 *  3. El bot avisa a la creadora (solo la primera vez).
 *  4. La MiniApp abre el chat de la creadora con el mensaje ya escrito.
 */
export async function registerInterest(customer: Customer, productId: string) {
  const product = await must<ProductRow | null>(db().from("shop_products").select("*").eq("id", productId).maybeSingle(), "interest_product");
  if (!product) throw new AppError("product_not_found", "Este producto ya no existe.", 404);

  const [shop, brand, sub, ctx] = await Promise.all([getSettings("shop"), getSettings("brand"), getSubscription(customer.id), messageContext()]);
  if (!brand.contactUsername) throw new AppError("contact_missing", "La tienda todavía no tiene configurado el contacto. Inténtalo más tarde.", 503);
  const isVip = vipStatus(sub) === "active";
  const price = computePrice(product, { isVip, vipDiscountPercent: shop.vipDiscountPercent });

  const { data, error } = await db().rpc("shop_register_interest", {
    p_product_id: productId,
    p_customer_id: customer.id,
    p_price_shown_cents: price.finalCents,
    p_was_vip: isVip,
  });
  if (error) throw dbError(error, "register_interest");
  const row = (Array.isArray(data) ? data[0] : data) as { interest_id: string; is_new: boolean };

  const message = ctx.t("template.interest", {
    producto: product.title,
    precio: eurosShort(price.finalCents),
    talla: product.size,
    color: product.color,
    nombre: customer.first_name,
  });
  const url = chatLink(brand.contactUsername, message);

  if (row.is_new) {
    const { count } = await db().from("shop_sales").select("id", { count: "exact", head: true }).eq("customer_id", customer.id).is("voided_at", null);
    const customerChat = customer.username ? `https://t.me/${customer.username}` : `tg://user?id=${customer.telegram_id}`;
    await notifyAdmin(
      "interest",
      {
        cliente: displayName(customer),
        producto: product.title,
        precio: `${eurosShort(price.finalCents)}${price.isVipPrice ? " (precio VIP)" : ""}`,
        es_vip: isVip ? "sí" : "no",
        compras: count ?? 0,
      },
      `interest:${row.interest_id}`,
      keyboard([[{ text: "💬 Abrir su chat", url: customerChat }, { text: "📋 Ver en el panel", url: `${appUrl()}/admin/tienda/intereses` }]]),
    );
    await logActivity({ actor: "cliente", action: "shop_interest", customerId: customer.id, summary: `Le interesa «${product.title}» (${eurosShort(price.finalCents)})`, data: { interest_id: row.interest_id, product_id: productId } });
  }
  return { message, url, isNew: row.is_new };
}

export async function updateInterest(id: string, patch: { status?: InterestStatus; admin_note?: string | null }) {
  await must(db().from("shop_interests").update(patch).eq("id", id), "update_interest");
}
