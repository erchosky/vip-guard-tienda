"use server";

import { randomBytes } from "node:crypto";
import { adminAction } from "@/modules/admin/action";
import { f } from "@/modules/admin/form";
import type { ActionState } from "@/components/ui/action-form";
import { AppError } from "@/modules/core/errors";
import { db, must } from "@/modules/core/db";
import { appUrl, env } from "@/modules/core/env";
import { logActivity } from "@/modules/core/activity";
import { euros } from "@/modules/core/money";
import { formatHuman } from "@/modules/core/dates";
import { updateCustomerNotes } from "@/modules/customers/repo";
import { getSettings, saveSettings } from "@/modules/settings/repo";
import { restoreText, saveText } from "@/modules/texts/repo";
import { connectBot } from "@/modules/telegram/setup";
import { enqueue } from "@/modules/telegram/outbox";
import { tg } from "@/modules/telegram/client";
import { PAYMENT_METHODS, adjustDays, registerPayment, retryExpulsion, revokeNow, setCustomerBan, setEndDate, voidPayment, type PaymentMethod } from "@/modules/vip/access";
import { connectChannel, ensureInviteLink, refreshChannelCheck } from "@/modules/vip/channel";
import { updateChannel } from "@/modules/vip/repo";
import { runTick } from "@/modules/vip/scheduler";

const METHODS = PAYMENT_METHODS.map((m) => m.value) as PaymentMethod[];

// ───────────────────────────── Cliente / miembro ─────────────────────────────

export async function registerPaymentAction(_: ActionState, form: FormData) {
  return adminAction(async () => {
    const change = await registerPayment({
      customerId: f.uuid(form, "customerId", "el cliente"),
      planId: f.uuid(form, "planId", "el plan"),
      method: f.oneOf(form, "method", METHODS),
      amountCents: f.money(form, "amount", "el importe"),
      note: f.optStr(form, "note", 500),
    });
    return `${change.kind === "first" ? "Alta" : "Renovación"} registrada: ${euros(change.amount_cents)}. VIP hasta el ${formatHuman(change.new_ends_at)}. El bot ya le ha avisado.`;
  });
}

export async function adjustDaysAction(_: ActionState, form: FormData) {
  return adminAction(async () => {
    const days = f.int(form, "days", 0, -3650, 3650);
    const sign = f.str(form, "mode") === "remove" ? -1 : 1;
    const change = await adjustDays({ customerId: f.uuid(form, "customerId"), days: Math.abs(days) * sign, note: f.optStr(form, "note", 500), notify: f.bool(form, "notify") });
    return change.is_active ? `Hecho. VIP hasta el ${formatHuman(change.new_ends_at)}.` : "Hecho. Se ha quedado sin días y ha salido del canal.";
  });
}

export async function setEndDateAction(_: ActionState, form: FormData) {
  return adminAction(async () => {
    const endsAt = f.date(form, "endsAt");
    if (!endsAt) throw new AppError("required", "Elige la fecha y hora.");
    const change = await setEndDate({ customerId: f.uuid(form, "customerId"), endsAt, note: f.optStr(form, "note", 500) });
    return change.is_active ? `Fecha cambiada: VIP hasta el ${formatHuman(change.new_ends_at)}.` : "Fecha cambiada. Como ya ha pasado, ha salido del canal.";
  });
}

export async function revokeAction(_: ActionState, form: FormData) {
  return adminAction(async () => {
    if (f.str(form, "confirm").toUpperCase() !== "ECHAR") throw new AppError("confirm", "Escribe ECHAR para confirmar.");
    const ok = await revokeNow({ customerId: f.uuid(form, "customerId"), note: f.optStr(form, "note", 500) });
    return ok ? "Hecho: acceso cortado y fuera del canal." : "Acceso cortado. No se pudo sacar del canal ahora: se reintentará solo (mira Alertas).";
  });
}

export async function retryExpulsionAction(_: ActionState, form: FormData) {
  return adminAction(async () => {
    const ok = await retryExpulsion(f.uuid(form, "customerId"));
    return ok ? "Hecho: ya está fuera del canal." : "Sigue sin poder sacarle. Revisa los permisos del bot en «Canal y bot».";
  });
}

export async function banAction(_: ActionState, form: FormData) {
  return adminAction(async () => {
    const banned = f.str(form, "banned") === "1";
    await setCustomerBan(f.uuid(form, "customerId"), banned);
    return banned ? "Vetado: no podrá entrar al canal aunque tenga el enlace." : "Veto quitado.";
  });
}

export async function voidPaymentAction(_: ActionState, form: FormData) {
  return adminAction(async () => {
    await voidPayment(f.uuid(form, "paymentId"), f.str(form, "reason", 300));
    return "Pago anulado. Si también hay que quitar días, usa «Quitar días» o «Fijar fecha».";
  });
}

export async function notesAction(_: ActionState, form: FormData) {
  return adminAction(async () => {
    const tags = f.str(form, "tags", 500).split(/[,#\n]/);
    await updateCustomerNotes(f.uuid(form, "customerId"), f.str(form, "notes", 4000), tags);
    return "Notas guardadas.";
  });
}

// ───────────────────────────── Planes ─────────────────────────────

export async function savePlanAction(_: ActionState, form: FormData) {
  return adminAction(async () => {
    const id = f.optUuid(form, "id");
    const row = {
      name: f.required(form, "name", "el nombre", 80),
      description: f.optStr(form, "description", 500),
      duration_days: f.int(form, "duration_days", 30, 1, 3650),
      price_first_cents: f.requiredMoney(form, "price_first", "el precio de alta"),
      price_renewal_cents: f.money(form, "price_renewal", "el precio de renovación") ?? f.requiredMoney(form, "price_first", "el precio de alta"),
      status: f.oneOf(form, "status", ["active", "hidden", "archived"] as const, "active"),
      is_featured: f.bool(form, "is_featured"),
      sort_order: f.int(form, "sort_order", 100, 0, 10000),
    };
    if (id) await must(db().from("vip_plans").update(row).eq("id", id), "update_plan");
    else await must(db().from("vip_plans").insert(row), "insert_plan");
    await logActivity({ actor: "admin", action: id ? "plan_updated" : "plan_created", summary: `Plan ${id ? "editado" : "creado"}: ${row.name} (${euros(row.price_first_cents)} alta / ${euros(row.price_renewal_cents)} renovación)` });
    return id ? "Plan guardado." : "Plan creado.";
  });
}

// ───────────────────────────── Textos ─────────────────────────────

export async function saveTextAction(_: ActionState, form: FormData) {
  return adminAction(async () => {
    const key = f.required(form, "key", "el texto", 100);
    const { restored } = await saveText(key, f.str(form, "body", 4000));
    await logActivity({ actor: "admin", action: "text_saved", summary: `Texto editado: ${key}` });
    return restored ? "Es igual que el original: se ha restaurado." : "Texto guardado. Se usa desde ya.";
  });
}

export async function restoreTextAction(_: ActionState, form: FormData) {
  return adminAction(async () => {
    const key = f.required(form, "key", "el texto", 100);
    await restoreText(key);
    await logActivity({ actor: "admin", action: "text_restored", summary: `Texto restaurado al original: ${key}` });
    return "Texto original restaurado.";
  });
}

// ───────────────────────────── Canal y bot ─────────────────────────────

export async function connectBotAction(_: ActionState) {
  return adminAction(async () => {
    const status = await connectBot();
    await logActivity({ actor: "admin", action: "bot_connected", summary: "Bot conectado (webhook, comandos y botón de tienda)" });
    return status.webhookOk ? `Bot @${status.username} conectado y listo.` : "Configuración enviada, pero Telegram aún no confirma el webhook. Espera un minuto y recarga.";
  });
}

export async function connectChannelAction(_: ActionState, form: FormData) {
  return adminAction(async () => {
    const raw = f.required(form, "chatId", "el ID del canal", 30).replace(/\s/g, "");
    const chatId = Number(raw);
    if (!Number.isSafeInteger(chatId) || chatId >= 0) throw new AppError("invalid_chat", "El ID del canal empieza por -100 (por ejemplo -1001234567890).");
    const check = await connectChannel(chatId);
    await logActivity({ actor: "admin", action: "channel_connected", summary: `Canal VIP conectado: ${check.title ?? chatId}` });
    if (!check.found) throw new AppError("channel_not_found", `El bot no ve ese canal: ${check.error ?? "añádelo como administrador"}.`);
    if (!check.ok) return "Canal guardado, pero al bot le faltan permisos. Mira la lista de abajo.";
    return `Canal «${check.title}» conectado. Enlace de acceso creado.`;
  });
}

export async function refreshChannelAction(_: ActionState) {
  return adminAction(async () => {
    const check = await refreshChannelCheck();
    if (!check) throw new AppError("channel_missing", "Primero conecta el canal.");
    if (check.ok && !(await getChannelLink())) await ensureInviteLink();
    return check.ok ? "Todo correcto: el bot tiene los permisos que necesita." : "Aún faltan permisos. Revisa la lista.";
  });
}

async function getChannelLink() {
  const { data } = await db().from("vip_channel").select("invite_link").eq("id", 1).maybeSingle();
  return data?.invite_link as string | null;
}

export async function regenerateLinkAction(_: ActionState) {
  return adminAction(async () => {
    await ensureInviteLink(true);
    await logActivity({ actor: "admin", action: "invite_regenerated", summary: "Enlace del canal regenerado (el anterior ya no funciona)" });
    return "Enlace nuevo creado. El anterior ha dejado de funcionar.";
  });
}

export async function channelRulesAction(_: ActionState, form: FormData) {
  return adminAction(async () => {
    const hours = form.getAll("reminderHours").map((v) => Number(v)).filter((n) => [1, 3, 6, 12, 24, 48, 72, 168].includes(n));
    await updateChannel({ auto_expel: f.bool(form, "auto_expel"), reminders_enabled: f.bool(form, "reminders_enabled") });
    await saveSettings("vip", { reminderHours: [...new Set(hours)].sort((a, b) => b - a).slice(0, 5) });
    await logActivity({ actor: "admin", action: "channel_rules", summary: `Reglas del canal: autoexpulsión ${f.bool(form, "auto_expel") ? "sí" : "no"}, avisos ${hours.join("/") || "ninguno"} h antes` });
    return "Reglas guardadas.";
  });
}

export async function createLinkCodeAction(_: ActionState) {
  return adminAction(async () => {
    const code = randomBytes(4).toString("hex").toUpperCase();
    await saveSettings("admin", { linkCode: code, linkCodeExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString() });
    return "Código creado. Pulsa «Abrir el bot» (caduca en 15 minutos).";
  });
}

export async function unlinkAdminAction(_: ActionState) {
  return adminAction(async () => {
    await saveSettings("admin", { telegramId: null, telegramName: null });
    return "Tu Telegram se ha desvinculado: ya no recibirás avisos.";
  });
}

export async function alertTogglesAction(_: ActionState, form: FormData) {
  return adminAction(async () => {
    await saveSettings("features", { interestAlerts: f.bool(form, "interestAlerts"), planRequestAlerts: f.bool(form, "planRequestAlerts"), broadcasts: f.bool(form, "broadcasts") });
    return "Preferencias guardadas.";
  });
}

export async function testAlertAction(_: ActionState) {
  return adminAction(async () => {
    const admin = await getSettings("admin");
    if (!admin.telegramId) throw new AppError("not_linked", "Primero vincula tu Telegram.");
    await tg().sendMessage(admin.telegramId, "✅ Prueba: así te llegarán los avisos del panel.");
    return "Mensaje de prueba enviado a tu Telegram.";
  });
}

export async function enableSchedulerAction(_: ActionState) {
  return adminAction(async () => {
    const url = `${appUrl()}/api/cron/tick`;
    const { data, error } = await db().rpc("scheduler_configure", { p_url: url, p_secret: env().CRON_SECRET });
    if (error) throw new AppError("scheduler_failed", `No se pudo activar: ${error.message}`, 500);
    const result = data as { ok: boolean; error?: string };
    if (!result.ok) {
      const reasons: Record<string, string> = {
        pg_cron_missing: "Activa la extensión pg_cron en Supabase (Database → Extensions) y vuelve a pulsar.",
        pg_net_missing: "Activa la extensión pg_net en Supabase (Database → Extensions) y vuelve a pulsar.",
        invalid_url: "La app tiene que estar publicada con https.",
        invalid_secret: "Falta CRON_SECRET en la configuración del servidor.",
      };
      throw new AppError("scheduler_failed", reasons[result.error ?? ""] ?? "No se pudo activar el programador.");
    }
    await logActivity({ actor: "admin", action: "scheduler_enabled", summary: "Programador activado (cada minuto)" });
    return "Programador activado: se ejecuta cada minuto.";
  });
}

export async function runTickAction(_: ActionState) {
  return adminAction(async () => {
    const result = await runTick();
    if (result.skipped) return "Ya se estaba ejecutando. Prueba en un minuto.";
    return `Hecho en ${result.ms} ms · caducados: ${result.expired} · expulsados: ${result.expelled} · avisos: ${result.reminders} · mensajes enviados: ${result.sent}`;
  });
}

// ───────────────────────────── Alertas ─────────────────────────────

export async function resolveAlertAction(_: ActionState, form: FormData) {
  return adminAction(async () => {
    const id = f.optUuid(form, "id");
    let query = db().from("alerts").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("status", "open");
    if (id) query = query.eq("id", id);
    await must(query, "resolve_alert");
    return id ? "Alerta marcada como resuelta." : "Todas las alertas marcadas como resueltas.";
  });
}

// ───────────────────────────── Difusión ─────────────────────────────

const SEGMENTS = ["all", "vip", "ex_vip", "buyers", "no_vip"] as const;

export async function sendBroadcastAction(_: ActionState, form: FormData) {
  return adminAction(async () => {
    const features = await getSettings("features");
    if (!features.broadcasts) throw new AppError("disabled", "La difusión está desactivada. Actívala en «Canal y bot».");
    const body = f.required(form, "body", "el mensaje", 4000);
    const segment = f.oneOf(form, "segment", SEGMENTS);
    const filter = { all: "all", vip: "active", ex_vip: "expired", buyers: "buyers", no_vip: "no_vip" }[segment];
    const { data, error } = await db().rpc("admin_customers", { p_filter: filter, p_limit: 200, p_offset: 0 });
    if (error) throw new AppError("db_error", "No se pudo preparar la lista.", 500);
    let recipients = (data ?? []) as Array<{ id: string; telegram_id: number; bot_blocked_at: string | null; is_banned: boolean }>;
    const total = Number((data?.[0] as { total_count?: number } | undefined)?.total_count ?? 0);
    for (let offset = 200; offset < total; offset += 200) {
      const page = await db().rpc("admin_customers", { p_filter: filter, p_limit: 200, p_offset: offset });
      recipients = recipients.concat((page.data ?? []) as typeof recipients);
    }
    recipients = recipients.filter((r) => !r.bot_blocked_at && !r.is_banned);
    if (recipients.length === 0) throw new AppError("empty", "No hay nadie en ese grupo que pueda recibir mensajes.");
    const { data: broadcast, error: bErr } = await db().from("broadcasts").insert({ body, segment, recipients: recipients.length }).select("id").single();
    if (bErr) throw new AppError("db_error", "No se pudo guardar la difusión.", 500);
    await enqueue(recipients.map((r) => ({ kind: "broadcast", chatId: Number(r.telegram_id), customerId: r.id, text: body, dedupeKey: `broadcast:${broadcast.id}:${r.id}` })));
    await logActivity({ actor: "admin", action: "broadcast", summary: `Difusión a ${recipients.length} personas (${segment})` });
    return `Enviándose a ${recipients.length} personas. Tardará unos minutos (el programador lo manda poco a poco).`;
  });
}
