import "server-only";
import { db } from "@/modules/core/db";
import { getManySettings } from "@/modules/settings/repo";
import { botStatus, type BotStatus } from "@/modules/telegram/setup";
import { getChannel, listPlans } from "@/modules/vip/repo";

export type SetupItem = { key: string; label: string; ok: boolean; detail: string; href: string };

export type SchedulerInfo = { lastOkAt: string | null; lastError: string | null; lastResult: Record<string, unknown> | null; healthy: boolean };

export async function schedulerInfo(): Promise<SchedulerInfo> {
  const { data } = await db().from("job_locks").select("last_ok_at, last_error, last_result").eq("job_name", "tick").maybeSingle();
  const lastOkAt = (data?.last_ok_at as string | null) ?? null;
  return {
    lastOkAt,
    lastError: (data?.last_error as string | null) ?? null,
    lastResult: (data?.last_result as Record<string, unknown> | null) ?? null,
    healthy: Boolean(lastOkAt && Date.now() - new Date(lastOkAt).getTime() < 5 * 60_000),
  };
}

/** Lista de comprobación para dejar todo funcionando. */
export async function setupStatus(): Promise<{ items: SetupItem[]; bot: BotStatus; scheduler: SchedulerInfo }> {
  const [bot, channel, settings, plans, scheduler] = await Promise.all([
    botStatus(),
    getChannel(),
    getManySettings(["brand", "admin"] as const),
    listPlans(),
    schedulerInfo(),
  ]);
  const check = channel.last_check && "ok" in channel.last_check ? channel.last_check : null;
  const items: SetupItem[] = [
    { key: "bot", label: "Bot conectado", ok: bot.webhookOk, detail: bot.webhookOk ? `@${bot.username}` : bot.error ?? "Pulsa «Conectar bot»", href: "/admin/vip/canal#bot" },
    { key: "channel", label: "Canal VIP conectado y con permisos", ok: Boolean(channel.telegram_chat_id && check?.ok), detail: channel.telegram_chat_id ? (check?.ok ? channel.title ?? "Canal" : "Faltan permisos del bot en el canal") : "Añade el bot como admin del canal", href: "/admin/vip/canal#canal" },
    { key: "link", label: "Enlace de acceso al canal", ok: Boolean(channel.invite_link), detail: channel.invite_link ? "Creado (solo entra quien tiene VIP)" : "Se crea al conectar el canal", href: "/admin/vip/canal#canal" },
    { key: "plans", label: "Planes VIP con precio", ok: plans.length > 0, detail: plans.length ? `${plans.length} plan(es) visibles` : "Crea al menos un plan", href: "/admin/vip/planes" },
    { key: "contact", label: "Tu @usuario de contacto", ok: Boolean(settings.brand.contactUsername), detail: settings.brand.contactUsername ? `@${settings.brand.contactUsername}` : "Necesario para los mensajes «Me interesa»", href: "/admin/tienda/ajustes" },
    { key: "admin", label: "Avisos a tu Telegram", ok: Boolean(settings.admin.telegramId), detail: settings.admin.telegramId ? settings.admin.telegramName ?? "Vinculado" : "Vincula tu Telegram para recibir avisos", href: "/admin/vip/canal#avisos" },
    { key: "scheduler", label: "Programador cada minuto", ok: scheduler.healthy, detail: scheduler.healthy ? "Funcionando" : "Actívalo para expulsar y avisar a tiempo", href: "/admin/vip/canal#programador" },
  ];
  return { items, bot, scheduler };
}
