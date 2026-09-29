import "server-only";
import { db } from "@/modules/core/db";
import { dbError, AppError } from "@/modules/core/errors";
import { logActivity, resolveAlerts } from "@/modules/core/activity";
import { euros } from "@/modules/core/money";
import { formatHuman, timeLeft } from "@/modules/core/dates";
import { sendNow } from "@/modules/telegram/outbox";
import { displayName } from "@/modules/telegram/links";
import { getCustomer, setBanned } from "@/modules/customers/repo";
import { messageContext } from "./context";
import { joinKeyboard } from "./messages";
import { getChannel, getSubscription } from "./repo";
import { banFromChannel, ensureInviteLink } from "./channel";
import { expel } from "./expulsion";

export type PaymentMethod = "bizum" | "paypal" | "efectivo" | "transferencia" | "otro";
export const PAYMENT_METHODS: Array<{ value: PaymentMethod; label: string }> = [
  { value: "bizum", label: "Bizum" },
  { value: "paypal", label: "PayPal" },
  { value: "transferencia", label: "Transferencia" },
  { value: "efectivo", label: "Efectivo" },
  { value: "otro", label: "Otro" },
];

type VipChange = {
  payment_id: string;
  kind: "first" | "renewal" | "gift" | "adjustment";
  previous_ends_at: string | null;
  new_ends_at: string;
  was_active: boolean;
  is_active: boolean;
  days_added: number;
  amount_cents: number;
};

async function inviteLinkOrNull(): Promise<string | null> {
  try {
    return await ensureInviteLink();
  } catch {
    return null;
  }
}

/**
 * Registra un pago en un solo paso: guarda el pago con importe y método, suma
 * los días (a lo que le queda o desde ahora) y el bot le manda el acceso.
 */
export async function registerPayment(input: { customerId: string; planId: string; method: PaymentMethod; amountCents?: number | null; note?: string | null }) {
  const customer = await getCustomer(input.customerId);
  const { data, error } = await db().rpc("vip_register_payment", {
    p_customer_id: input.customerId,
    p_plan_id: input.planId,
    p_method: input.method,
    p_amount_cents: input.amountCents ?? null,
    p_note: input.note ?? null,
  });
  if (error) throw dbError(error, "register_payment");
  const change = data as VipChange;

  if (customer.is_banned) await setBanned(customer.id, false);
  await resolveAlerts("expulsion_failed", customer.id);

  const ctx = await messageContext();
  const link = await inviteLinkOrNull();
  const vars = { nombre: customer.first_name, fecha_fin: formatHuman(change.new_ends_at), dias_restantes: timeLeft(change.new_ends_at) };
  const key = change.kind === "first" ? "bot.access_granted" : change.was_active ? "bot.access_renewed" : "bot.access_back";
  await sendNow([{
    kind: change.kind === "first" ? "access" : "renewal",
    chatId: customer.telegram_id,
    customerId: customer.id,
    text: ctx.t(key, vars),
    keyboard: change.was_active ? undefined : joinKeyboard(ctx, link),
    dedupeKey: `payment:${change.payment_id}`,
  }]);

  await logActivity({
    actor: "admin",
    action: change.kind === "first" ? "vip_first_payment" : "vip_renewal",
    customerId: customer.id,
    summary: `${change.kind === "first" ? "Alta VIP" : "Renovación VIP"} de ${displayName(customer)}: ${euros(change.amount_cents)} por ${input.method}, +${change.days_added} días (hasta ${formatHuman(change.new_ends_at)})`,
    data: { payment_id: change.payment_id, plan_id: input.planId },
  });
  return change;
}

/** Regala (o quita) días. */
export async function adjustDays(input: { customerId: string; days: number; note?: string | null; notify?: boolean }) {
  if (!Number.isInteger(input.days) || input.days === 0) throw new AppError("invalid_days", "Indica un número de días distinto de cero.");
  const customer = await getCustomer(input.customerId);
  const { data, error } = await db().rpc("vip_adjust", { p_customer_id: input.customerId, p_days: input.days, p_note: input.note ?? null });
  if (error) throw dbError(error, "adjust_days");
  const change = data as VipChange;

  if (input.days > 0 && input.notify !== false) {
    const ctx = await messageContext();
    const link = change.was_active ? null : await inviteLinkOrNull();
    await sendNow([{
      kind: "gift",
      chatId: customer.telegram_id,
      customerId: customer.id,
      text: ctx.t("bot.days_gifted", { nombre: customer.first_name, dias: input.days, fecha_fin: formatHuman(change.new_ends_at) }),
      keyboard: link ? joinKeyboard(ctx, link) : undefined,
      dedupeKey: `payment:${change.payment_id}`,
    }]);
  }
  await afterChange(customer.id, change);
  await logActivity({
    actor: "admin",
    action: input.days > 0 ? "vip_gift" : "vip_remove_days",
    customerId: customer.id,
    summary: `${input.days > 0 ? `Regalo de ${input.days}` : `Quitados ${-input.days}`} días a ${displayName(customer)} (hasta ${formatHuman(change.new_ends_at)})`,
  });
  return change;
}

/** Fija una fecha exacta de fin (si ya pasó, sale del canal al momento). */
export async function setEndDate(input: { customerId: string; endsAt: Date; note?: string | null }) {
  const customer = await getCustomer(input.customerId);
  const { data, error } = await db().rpc("vip_adjust", { p_customer_id: input.customerId, p_ends_at: input.endsAt.toISOString(), p_note: input.note ?? null });
  if (error) throw dbError(error, "set_end_date");
  const change = data as VipChange;
  if (change.is_active && !change.was_active) {
    const ctx = await messageContext();
    const link = await inviteLinkOrNull();
    await sendNow([{
      kind: "renewal",
      chatId: customer.telegram_id,
      customerId: customer.id,
      text: ctx.t("bot.access_back", { nombre: customer.first_name, fecha_fin: formatHuman(change.new_ends_at), dias_restantes: timeLeft(change.new_ends_at) }),
      keyboard: joinKeyboard(ctx, link),
      dedupeKey: `payment:${change.payment_id}`,
    }]);
  }
  await afterChange(customer.id, change);
  await logActivity({ actor: "admin", action: "vip_set_end", customerId: customer.id, summary: `Fecha de fin de ${displayName(customer)} cambiada a ${formatHuman(change.new_ends_at)}` });
  return change;
}

/** Echar ahora: corta el acceso y le saca del canal. */
export async function revokeNow(input: { customerId: string; note?: string | null }) {
  const customer = await getCustomer(input.customerId);
  const { data, error } = await db().rpc("vip_revoke", { p_customer_id: input.customerId, p_note: input.note ?? null });
  if (error) throw dbError(error, "revoke");
  await logActivity({ actor: "admin", action: "vip_revoke", customerId: customer.id, summary: `Acceso VIP cortado a ${displayName(customer)}` });
  const sub = await getSubscription(customer.id);
  if (sub) return expel({ subscription_id: sub.id, customer_id: customer.id, telegram_id: customer.telegram_id }, "manual");
  return false;
}

/** Reintenta una expulsión que falló. */
export async function retryExpulsion(customerId: string) {
  const customer = await getCustomer(customerId);
  const sub = await getSubscription(customerId);
  if (!sub || sub.status === "active") throw new AppError("nothing_to_expel", "Este cliente tiene el VIP activo: no hay nada que expulsar.");
  await db().from("subscriptions").update({ expulsion_status: "pending", expulsion_attempts: 0, next_expulsion_attempt_at: new Date().toISOString() }).eq("id", sub.id);
  return expel({ subscription_id: sub.id, customer_id: customer.id, telegram_id: customer.telegram_id }, "manual");
}

/** Anula un pago registrado por error (queda en el historial como anulado). */
export async function voidPayment(paymentId: string, reason: string) {
  const { data, error } = await db().rpc("vip_void_payment", { p_payment_id: paymentId, p_reason: reason });
  if (error) throw dbError(error, "void_payment");
  if (!data) throw new AppError("not_voidable", "Ese pago ya estaba anulado o no se puede anular.");
  await logActivity({ actor: "admin", action: "vip_payment_voided", summary: `Pago anulado: ${reason || "sin motivo"}`, data: { payment_id: paymentId } });
}

/** Vetar: no podrá entrar nunca aunque consiga el enlace. */
export async function setCustomerBan(customerId: string, banned: boolean) {
  const customer = await getCustomer(customerId);
  const channel = await getChannel();
  if (banned) {
    const sub = await getSubscription(customerId);
    if (sub && sub.status === "active") await revokeNow({ customerId, note: "Vetado" });
  }
  if (channel.telegram_chat_id) await banFromChannel(channel.telegram_chat_id, customer.telegram_id, banned);
  await setBanned(customerId, banned);
  await logActivity({ actor: "admin", action: banned ? "customer_banned" : "customer_unbanned", customerId, summary: `${displayName(customer)} ${banned ? "vetado" : "ya no está vetado"}` });
}

async function afterChange(customerId: string, change: VipChange) {
  if (change.is_active) return;
  const sub = await getSubscription(customerId);
  const customer = await getCustomer(customerId);
  if (sub && sub.expulsion_status === "pending") {
    await expel({ subscription_id: sub.id, customer_id: customerId, telegram_id: customer.telegram_id }, "manual");
  }
}
