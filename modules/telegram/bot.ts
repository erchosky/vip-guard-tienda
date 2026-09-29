import "server-only";
import { Bot, type Context } from "grammy";
import type { ChatMemberUpdated, ChatJoinRequest, User } from "grammy/types";
import { env } from "@/modules/core/env";
import { logActivity, raiseAlert, resolveAlerts } from "@/modules/core/activity";
import { checkRateLimit } from "@/modules/core/security/rate-limit";
import { getCustomerByTelegramId, markBotBlocked, upsertCustomer } from "@/modules/customers/repo";
import { getSettings, saveSettings } from "@/modules/settings/repo";
import { messageContext } from "@/modules/vip/context";
import { mainMenu, plansMessage, statusLine } from "@/modules/vip/messages";
import { getChannel, getSubscription, hasPaidBefore, listPlans } from "@/modules/vip/repo";
import { refreshChannelCheck } from "@/modules/vip/channel";
import { notifyAdmin } from "@/modules/vip/notify-admin";
import { requestPlan } from "@/modules/vip/requests";
import { AppError } from "@/modules/core/errors";
import { vipStatus } from "@/modules/vip/state";
import { telegramApiRoot } from "./client-config";
import { chatLink, displayName } from "./links";
import { keyboard, type Keyboard } from "./keyboard";

/**
 * Bot VIP Guard. Solo actúa en chats privados y en el canal VIP configurado:
 * cualquier otro grupo o canal se ignora, así que no interfiere con grupos
 * abiertos aunque alguien lo añada.
 */
const USER_RATE_LIMIT = { limit: 30, windowMs: 60_000 };
const UNKNOWN_COOLDOWN_MS = 10 * 60_000;

function markup(kb: Keyboard | undefined) {
  return kb ? { reply_markup: { inline_keyboard: kb } } : {};
}

async function reply(ctx: Context, text: string, kb?: Keyboard) {
  await ctx.reply(text, { ...markup(kb), link_preview_options: { is_disabled: true } });
}

async function showStart(ctx: Context, from: User) {
  const before = await getCustomerByTelegramId(from.id);
  const customer = await upsertCustomer(from, { startedBot: true });
  const [mctx, sub, channel] = await Promise.all([messageContext(), getSubscription(customer.id), getChannel()]);
  const isActive = vipStatus(sub) === "active";
  const text = `${mctx.t("bot.welcome", { nombre: customer.first_name })}\n\n${statusLine(mctx, sub, customer.first_name)}`;
  await reply(ctx, text, mainMenu(mctx, { isActive, inviteLink: channel.invite_link }));
  if (!before?.started_bot_at) {
    await logActivity({ actor: "cliente", action: "bot_start", customerId: customer.id, summary: `${displayName(customer)} ha abierto el bot por primera vez` });
  }
}

async function showVip(ctx: Context, from: User) {
  const customer = await upsertCustomer(from, { startedBot: true });
  const [mctx, sub, channel, plans, paid] = await Promise.all([
    messageContext(), getSubscription(customer.id), getChannel(), listPlans(), hasPaidBefore(customer.id),
  ]);
  const status = statusLine(mctx, sub, customer.first_name);
  if (plans.length === 0) {
    const contact = chatLink(mctx.contactUsername);
    await reply(ctx, status, keyboard([
      vipStatus(sub) === "active" && channel.invite_link ? [{ text: mctx.t("bot.button_join"), url: channel.invite_link }] : [],
      contact ? [{ text: mctx.t("bot.button_contact"), url: contact }] : [],
    ]));
    return;
  }
  const offer = plansMessage(mctx, plans, paid, customer.first_name, vipStatus(sub) === "none" ? undefined : status);
  const kb = vipStatus(sub) === "active" && channel.invite_link
    ? [[{ text: mctx.t("bot.button_join"), url: channel.invite_link }], ...(offer.keyboard ?? [])]
    : offer.keyboard;
  await reply(ctx, offer.text, kb);
}

async function showHelp(ctx: Context) {
  const mctx = await messageContext();
  const contact = chatLink(mctx.contactUsername);
  await reply(ctx, mctx.t("bot.help"), keyboard([contact ? [{ text: mctx.t("bot.button_contact"), url: contact }] : []]));
}

async function choosePlan(ctx: Context, from: User, planId: string) {
  const customer = await upsertCustomer(from, { startedBot: true });
  try {
    const request = await requestPlan(customer, planId);
    await reply(ctx, request.ctx.t("bot.plan_chosen", { nombre: customer.first_name, plan: request.plan.name, precio: request.price }), keyboard([[{ text: request.ctx.t("bot.button_contact"), url: request.url }]]));
  } catch (error) {
    if (error instanceof AppError && error.code === "contact_missing") return showHelp(ctx);
    if (error instanceof AppError && error.code === "plan_not_found") return showVip(ctx, from);
    throw error;
  }
}

async function linkAdmin(ctx: Context, from: User, code: string) {
  const admin = await getSettings("admin");
  const valid = admin.linkCode && code && admin.linkCode === code.trim().toUpperCase()
    && admin.linkCodeExpiresAt && new Date(admin.linkCodeExpiresAt).getTime() > Date.now();
  if (!valid) {
    await reply(ctx, "Ese código no es válido o ha caducado. Genera uno nuevo en el panel (VIP → Canal).");
    return;
  }
  await saveSettings("admin", { telegramId: from.id, telegramName: [from.first_name, from.username ? `@${from.username}` : null].filter(Boolean).join(" "), linkCode: null, linkCodeExpiresAt: null });
  await upsertCustomer(from, { startedBot: true });
  await reply(ctx, "✅ ¡Listo! A partir de ahora te aviso aquí de los «Me interesa», de quién quiere un plan y de cualquier problema importante.");
  await logActivity({ actor: "admin", action: "admin_linked", summary: "Telegram de la creadora vinculado para recibir avisos" });
}

async function handleJoinRequest(request: ChatJoinRequest) {
  const channel = await getChannel();
  if (!channel.telegram_chat_id || request.chat.id !== channel.telegram_chat_id) return;
  const api = (await getBot()).api;
  const customer = await upsertCustomer(request.from);
  const sub = await getSubscription(customer.id);
  const mctx = await messageContext();

  if (customer.is_banned) {
    await api.declineChatJoinRequest(request.chat.id, request.from.id).catch(() => undefined);
    await logActivity({ actor: "bot", action: "join_declined_banned", customerId: customer.id, summary: `Solicitud rechazada: ${displayName(customer)} está vetado` });
    return;
  }

  if (vipStatus(sub) === "active") {
    try {
      await api.approveChatJoinRequest(request.chat.id, request.from.id);
      await api.sendMessage(request.user_chat_id, mctx.t("bot.join_approved", { nombre: customer.first_name })).catch(() => undefined);
      await logActivity({ actor: "bot", action: "join_approved", customerId: customer.id, summary: `${displayName(customer)} ha entrado al canal` });
    } catch (error) {
      await raiseAlert({ code: "join_approve_failed", severity: "critical", title: "El bot no pudo aceptar a un miembro VIP", detail: "Revisa que el bot sea administrador del canal con permiso para añadir miembros.", customerId: customer.id, data: { error: String(error) } });
      throw error;
    }
    return;
  }

  // Telegram solo deja escribirle antes de resolver la solicitud.
  const [plans, paid] = await Promise.all([listPlans(), hasPaidBefore(customer.id)]);
  const offer = plansMessage(mctx, plans, paid, customer.first_name, mctx.t("bot.join_denied", { nombre: customer.first_name }));
  await api.sendMessage(request.user_chat_id, offer.text, { ...markup(offer.keyboard), link_preview_options: { is_disabled: true } }).catch(() => undefined);
  await api.declineChatJoinRequest(request.chat.id, request.from.id).catch(() => undefined);
  await logActivity({ actor: "bot", action: "join_declined", customerId: customer.id, summary: `${displayName(customer)} pidió entrar sin VIP: se le enviaron los planes` });
}

async function handleChannelMember(update: ChatMemberUpdated) {
  const channel = await getChannel();
  if (!channel.telegram_chat_id || update.chat.id !== channel.telegram_chat_id) return;
  const user = update.new_chat_member.user;
  if (user.is_bot) return;
  const was = update.old_chat_member.status;
  const now = update.new_chat_member.status;
  const wasIn = was === "member" || was === "administrator" || was === "creator" || (was === "restricted" && update.old_chat_member.is_member);
  const isIn = now === "member" || now === "administrator" || now === "creator" || (now === "restricted" && update.new_chat_member.is_member);
  if (wasIn === isIn) return;

  const customer = await upsertCustomer(user);
  const sub = await getSubscription(customer.id);
  const { db } = await import("@/modules/core/db");
  if (isIn) {
    if (sub) await db().from("subscriptions").update({ joined_channel_at: new Date().toISOString(), left_channel_at: null }).eq("id", sub.id);
    if (vipStatus(sub) !== "active" && now === "member") {
      await raiseAlert({
        code: "member_without_vip",
        severity: "warning",
        title: "Ha entrado alguien al canal sin VIP",
        detail: `${displayName(customer)} está en el canal sin suscripción activa (¿lo añadiste a mano?). Regístrale un pago o sácale desde su ficha.`,
        customerId: customer.id,
      });
    }
  } else if (sub) {
    await db().from("subscriptions").update({ left_channel_at: new Date().toISOString() }).eq("id", sub.id);
    if (now === "left") await logActivity({ actor: "cliente", action: "left_channel", customerId: customer.id, summary: `${displayName(customer)} ha salido del canal` });
  }
}

async function handleMyChatMember(update: ChatMemberUpdated) {
  const status = update.new_chat_member.status;
  if (update.chat.type === "private") {
    await markBotBlocked(update.chat.id, status === "kicked");
    return;
  }
  if (update.chat.type === "channel" && status === "administrator") {
    const detected = await getSettings("detected_channels");
    const list = [
      { id: update.chat.id, title: update.chat.title ?? "Canal", at: new Date().toISOString() },
      ...detected.list.filter((c) => c.id !== update.chat.id),
    ].slice(0, 10);
    await saveSettings("detected_channels", { list });
  }
  const channel = await getChannel();
  if (channel.telegram_chat_id !== update.chat.id) return;
  const check = await refreshChannelCheck();
  if (check?.ok) {
    await resolveAlerts("bot_permissions_lost");
    return;
  }
  await raiseAlert({
    code: "bot_permissions_lost",
    severity: "critical",
    title: "El bot ha perdido permisos en el canal VIP",
    detail: "Sin permisos no puede aceptar a los VIP ni sacar a quien caduca. Hazlo administrador con «Añadir miembros» y «Expulsar usuarios».",
  });
  await notifyAdmin("problem", { cliente: null }, `perm_lost:${new Date().toISOString().slice(0, 13)}`);
}

async function withUserLimit(ctx: Context, next: () => Promise<void>) {
  if (!ctx.from || ctx.from.is_bot) return;
  // Solicitudes de unión y cambios de miembros no se limitan.
  if (!ctx.message && !ctx.callbackQuery) return next();
  const limited = await checkRateLimit(`tg-user:${ctx.from.id}`, USER_RATE_LIMIT.limit, USER_RATE_LIMIT.windowMs);
  if (!limited.allowed) return;
  return next();
}

export function createBot() {
  const bot = new Bot(env().TELEGRAM_BOT_TOKEN, { client: { apiRoot: telegramApiRoot() } });
  bot.use(withUserLimit);

  const pm = bot.chatType("private");
  pm.command("start", (ctx) => {
    const payload = String(ctx.match ?? "").trim();
    if (payload.startsWith("link_")) return linkAdmin(ctx, ctx.from, payload.slice(5));
    return showStart(ctx, ctx.from);
  });
  pm.command("vip", (ctx) => showVip(ctx, ctx.from));
  pm.command(["ayuda", "help"], (ctx) => showHelp(ctx));
  pm.command("vincular", (ctx) => linkAdmin(ctx, ctx.from, String(ctx.match ?? "")));
  pm.command("id", (ctx) => reply(ctx, `Tu ID de Telegram es ${ctx.from.id}`));

  bot.callbackQuery("vip", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    await showVip(ctx, ctx.from);
  });
  bot.callbackQuery("help", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    await showHelp(ctx);
  });
  bot.callbackQuery(/^plan:([0-9a-f-]{36})$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    await choosePlan(ctx, ctx.from, ctx.match[1]);
  });
  bot.on("callback_query", (ctx) => ctx.answerCallbackQuery().catch(() => undefined));

  bot.on("chat_join_request", (ctx) => handleJoinRequest(ctx.chatJoinRequest));
  bot.on("chat_member", (ctx) => handleChannelMember(ctx.chatMember));
  bot.on("my_chat_member", (ctx) => handleMyChatMember(ctx.myChatMember));

  pm.on("message", async (ctx) => {
    const allowed = await checkRateLimit(`tg-unknown:${ctx.from.id}`, 1, UNKNOWN_COOLDOWN_MS);
    if (!allowed.allowed) return;
    const customer = await upsertCustomer(ctx.from, { startedBot: true });
    const [mctx, sub, channel] = await Promise.all([messageContext(), getSubscription(customer.id), getChannel()]);
    await reply(ctx, mctx.t("bot.unknown"), mainMenu(mctx, { isActive: vipStatus(sub) === "active", inviteLink: channel.invite_link }));
  });

  return bot;
}

const store = globalThis as typeof globalThis & { __vipBot?: Promise<Bot> };

/** Bot inicializado una sola vez por instancia (getMe cacheado). */
export function getBot(): Promise<Bot> {
  if (!store.__vipBot) {
    const bot = createBot();
    store.__vipBot = bot.init().then(() => bot).catch((error) => {
      store.__vipBot = undefined;
      throw error;
    });
  }
  return store.__vipBot;
}

