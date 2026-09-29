import "server-only";
import { AppError } from "@/modules/core/errors";
import { eurosShort } from "@/modules/core/money";
import { logActivity } from "@/modules/core/activity";
import { chatLink, displayName } from "@/modules/telegram/links";
import type { Customer } from "@/modules/customers/repo";
import { messageContext } from "./context";
import { planRequestText } from "./messages";
import { notifyAdmin } from "./notify-admin";
import { getPlan, getSubscription, hasPaidBefore } from "./repo";
import { planPrice, vipStatus } from "./state";

/**
 * Un cliente quiere un plan (desde el bot o la MiniApp): se prepara el mensaje
 * para la creadora con el precio que le toca y se le avisa por el bot.
 */
export async function requestPlan(customer: Customer, planId: string) {
  const plan = await getPlan(planId);
  if (plan.status !== "active") throw new AppError("plan_not_found", "Ese plan ya no está disponible.", 404);
  const [ctx, paid, sub] = await Promise.all([messageContext(), hasPaidBefore(customer.id), getSubscription(customer.id)]);
  const price = eurosShort(planPrice(plan, paid));
  const text = planRequestText(ctx, plan, paid, customer.first_name);
  const url = chatLink(ctx.contactUsername, text);
  if (!url) throw new AppError("contact_missing", "Todavía no está configurado el contacto. Inténtalo más tarde.", 503);
  const status = vipStatus(sub);
  await notifyAdmin(
    "plan_request",
    { cliente: displayName(customer), plan: plan.name, precio: price, estado: status === "active" ? "ya es VIP (renovación)" : status === "expired" ? "VIP caducado" : paid ? "fue VIP" : "nuevo" },
    `plan_request:${customer.id}:${plan.id}:${new Date().toISOString().slice(0, 10)}`,
  );
  await logActivity({ actor: "cliente", action: "plan_request", customerId: customer.id, summary: `Quiere el plan ${plan.name} (${price})` });
  return { plan, price, text, url, ctx };
}
