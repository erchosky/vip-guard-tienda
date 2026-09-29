import "server-only";
import { Api, GrammyError, HttpError } from "grammy";
import { env } from "@/modules/core/env";
import { telegramApiRoot } from "./client-config";

const store = globalThis as typeof globalThis & { __vipTgApi?: Api; __vipTgKey?: string };

/** Cliente de la API de bots de Telegram (reutilizado entre peticiones). */
export function tg(): Api {
  const token = env().TELEGRAM_BOT_TOKEN;
  const root = telegramApiRoot();
  const key = `${root}:${token}`;
  if (!store.__vipTgApi || store.__vipTgKey !== key) {
    store.__vipTgApi = new Api(token, { apiRoot: root });
    store.__vipTgKey = key;
  }
  return store.__vipTgApi;
}

export type TelegramFailure =
  | { kind: "rate_limited"; retryAfter: number; message: string }
  | { kind: "blocked"; message: string }
  | { kind: "chat_not_found"; message: string }
  | { kind: "no_rights"; message: string }
  | { kind: "bad_request"; message: string }
  | { kind: "network"; message: string };

/** Traduce un error de Telegram a algo accionable. */
export function classifyTelegramError(error: unknown): TelegramFailure {
  if (error instanceof GrammyError) {
    const message = error.description;
    const lower = message.toLowerCase();
    if (error.error_code === 429) return { kind: "rate_limited", retryAfter: error.parameters?.retry_after ?? 5, message };
    if (error.error_code === 403 && /blocked|deactivated|can't initiate|initiate conversation/.test(lower)) return { kind: "blocked", message };
    if (/chat not found|user not found|peer_id_invalid|participant_id_invalid/.test(lower)) return { kind: "chat_not_found", message };
    if (error.error_code === 403 || /not enough rights|admin_required|chat_admin_required|have no rights|need administrator/.test(lower)) return { kind: "no_rights", message };
    return { kind: "bad_request", message };
  }
  if (error instanceof HttpError) return { kind: "network", message: error.message };
  return { kind: "network", message: error instanceof Error ? error.message : String(error) };
}

export function failureLabel(failure: TelegramFailure): string {
  switch (failure.kind) {
    case "rate_limited": return `Telegram pidió esperar ${failure.retryAfter} s`;
    case "blocked": return "El usuario bloqueó el bot o nunca lo abrió";
    case "chat_not_found": return "El usuario no ha abierto el bot todavía";
    case "no_rights": return "El bot no tiene permisos suficientes en el canal";
    case "bad_request": return `Telegram rechazó la petición: ${failure.message}`;
    case "network": return "No se pudo contactar con Telegram";
  }
}
