import "server-only";
import { getSettings } from "@/modules/settings/repo";
import { enqueue, drainOutbox } from "@/modules/telegram/outbox";
import type { Keyboard } from "@/modules/telegram/keyboard";
import type { TemplateVars } from "@/modules/texts/render";
import { messageContext } from "./context";

const KEYS = {
  interest: "alert.interest",
  plan_request: "alert.plan_request",
  problem: "alert.problem",
} as const;

/**
 * Manda un aviso al Telegram de la creadora (si lo ha vinculado en el panel).
 * Nunca lanza: un aviso que no llega no debe romper la acción del cliente.
 */
export async function notifyAdmin(kind: keyof typeof KEYS, vars: TemplateVars, dedupeKey?: string, extraKeyboard?: Keyboard): Promise<boolean> {
  try {
    const [admin, features, ctx] = await Promise.all([getSettings("admin"), getSettings("features"), messageContext()]);
    if (!admin.telegramId) return false;
    if (kind === "interest" && !features.interestAlerts) return false;
    if (kind === "plan_request" && !features.planRequestAlerts) return false;
    await enqueue([{ kind: `admin_${kind}`, chatId: admin.telegramId, text: ctx.t(KEYS[kind], vars), keyboard: extraKeyboard, dedupeKey }]);
    await drainOutbox({ limit: 5, deadline: Date.now() + 5_000 });
    return true;
  } catch (error) {
    console.error("notify_admin_failed", kind, error);
    return false;
  }
}
