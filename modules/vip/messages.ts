import "server-only";
import { appUrl } from "@/modules/core/env";
import { eurosShort } from "@/modules/core/money";
import { formatHuman, timeLeft } from "@/modules/core/dates";
import { chatLink } from "@/modules/telegram/links";
import { keyboard, type Keyboard } from "@/modules/telegram/keyboard";
import type { MessageContext } from "./context";
import { durationLabel, planPrice, vipStatus, type Plan, type SubscriptionRow } from "./state";

export function statusLine(ctx: MessageContext, sub: SubscriptionRow | null, name: string | null) {
  const status = vipStatus(sub);
  if (status === "active" && sub) return ctx.t("bot.status_active", { nombre: name, dias_restantes: timeLeft(sub.ends_at), fecha_fin: formatHuman(sub.ends_at) });
  if (status === "expired" && sub) return ctx.t("bot.status_expired", { nombre: name, fecha_fin: formatHuman(sub.ends_at) });
  return ctx.t("bot.status_none", { nombre: name });
}

export function mainMenu(ctx: MessageContext, options: { inviteLink?: string | null; isActive?: boolean } = {}): Keyboard | undefined {
  return keyboard([
    [{ text: ctx.t("bot.button_shop"), web_app: { url: appUrl() } }],
    options.isActive && options.inviteLink ? [{ text: ctx.t("bot.button_join"), url: options.inviteLink }] : [],
    [{ text: ctx.t("bot.button_vip"), callback_data: "vip" }, { text: ctx.t("bot.button_help"), callback_data: "help" }],
  ]);
}

export function plansMessage(ctx: MessageContext, plans: Plan[], hasPaidBefore: boolean, name: string | null, intro?: string) {
  const lines = plans.map((plan) =>
    ctx.t("bot.plan_line", { plan: plan.name, precio: eurosShort(planPrice(plan, hasPaidBefore)), duracion: durationLabel(plan.duration_days) }),
  );
  const body = ctx.t("bot.plans", { nombre: name, planes: lines.join("\n") });
  const contact = chatLink(ctx.contactUsername);
  return {
    text: intro ? `${intro}\n\n${body}` : body,
    keyboard: keyboard([
      ...plans.map((plan) => [{ text: ctx.t("bot.button_plan", { plan: plan.name, precio: eurosShort(planPrice(plan, hasPaidBefore)) }), callback_data: `plan:${plan.id}` }]),
      contact ? [{ text: ctx.t("bot.button_contact"), url: contact }] : [],
    ]),
  };
}

/** Mensaje prellenado que el cliente envía a la creadora para pedir un plan. */
export function planRequestText(ctx: MessageContext, plan: Plan, hasPaidBefore: boolean, name: string | null) {
  return ctx.t("template.plan", { plan: plan.name, precio: eurosShort(planPrice(plan, hasPaidBefore)), duracion: durationLabel(plan.duration_days), nombre: name });
}

export function joinKeyboard(ctx: MessageContext, inviteLink: string | null) {
  return keyboard([inviteLink ? [{ text: ctx.t("bot.button_join"), url: inviteLink }] : []]);
}
