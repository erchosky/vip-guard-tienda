import "server-only";
import { appUrl, env } from "@/modules/core/env";
import { AppError } from "@/modules/core/errors";
import { getTranslator } from "@/modules/texts/repo";
import { classifyTelegramError, failureLabel, tg } from "./client";

export const ALLOWED_UPDATES = ["message", "callback_query", "my_chat_member", "chat_member", "chat_join_request"] as const;

/**
 * Deja el bot listo con un botón: webhook con secreto, comandos y botón de
 * menú que abre la tienda. Se puede repetir sin problema.
 */
export async function connectBot() {
  const url = `${appUrl()}/api/telegram/webhook`;
  if (!url.startsWith("https://")) throw new AppError("https_required", "La app tiene que estar publicada con https para conectar el bot.");
  const t = await getTranslator();
  try {
    await tg().setWebhook(url, {
      secret_token: env().TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: [...ALLOWED_UPDATES],
      max_connections: 40,
    });
    await tg().setMyCommands(
      [
        { command: "start", description: "Menú principal" },
        { command: "vip", description: "Mi VIP y planes" },
        { command: "ayuda", description: "Cómo funciona" },
      ],
      { scope: { type: "all_private_chats" } },
    );
    await tg().setChatMenuButton({ menu_button: { type: "web_app", text: t("miniapp.tab_shop"), web_app: { url: appUrl() } } });
  } catch (error) {
    throw new AppError("bot_setup_failed", `Telegram no aceptó la configuración: ${failureLabel(classifyTelegramError(error))}`, 502);
  }
  return botStatus();
}

export type BotStatus = {
  ok: boolean;
  username: string | null;
  webhookUrl: string | null;
  webhookOk: boolean;
  pending: number;
  lastError: string | null;
  lastErrorAt: string | null;
  error?: string;
};

export async function botStatus(): Promise<BotStatus> {
  try {
    const [me, info] = await Promise.all([tg().getMe(), tg().getWebhookInfo()]);
    const expected = `${appUrl()}/api/telegram/webhook`;
    const recentError = info.last_error_date && Date.now() / 1000 - info.last_error_date < 3600;
    return {
      ok: info.url === expected && !recentError,
      username: me.username ?? null,
      webhookUrl: info.url || null,
      webhookOk: info.url === expected,
      pending: info.pending_update_count,
      lastError: info.last_error_message ?? null,
      lastErrorAt: info.last_error_date ? new Date(info.last_error_date * 1000).toISOString() : null,
    };
  } catch (error) {
    return { ok: false, username: null, webhookUrl: null, webhookOk: false, pending: 0, lastError: null, lastErrorAt: null, error: failureLabel(classifyTelegramError(error)) };
  }
}
