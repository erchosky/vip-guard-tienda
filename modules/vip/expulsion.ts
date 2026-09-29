import "server-only";
import { db } from "@/modules/core/db";
import { logActivity, raiseAlert } from "@/modules/core/activity";
import { getChannel } from "./repo";
import { removeFromChannel } from "./channel";
import { notifyAdmin } from "./notify-admin";

type Target = { subscription_id: string; customer_id: string; telegram_id: number };

/** Intenta sacar del canal y guarda el resultado con reintentos exponenciales. */
export async function expel(target: Target, reason: "caducidad" | "manual"): Promise<boolean> {
  const channel = await getChannel();
  if (!channel.telegram_chat_id) {
    await db().rpc("vip_expulsion_result", { p_subscription_id: target.subscription_id, p_ok: false, p_error: "No hay canal conectado" });
    await raiseAlert({ code: "channel_missing", severity: "critical", title: "No hay canal VIP conectado", detail: "No se puede sacar a nadie del canal hasta que lo conectes en «Canal»." });
    return false;
  }
  const result = await removeFromChannel(channel.telegram_chat_id, Number(target.telegram_id));
  const { data: status } = await db().rpc("vip_expulsion_result", {
    p_subscription_id: target.subscription_id,
    p_ok: result.ok,
    p_error: result.ok ? null : result.error,
  });
  if (result.ok) {
    await logActivity({ actor: reason === "manual" ? "admin" : "bot", action: "expelled", customerId: target.customer_id, summary: reason === "manual" ? "Expulsado del canal manualmente" : "Expulsado del canal al caducar su VIP" });
    return true;
  }
  await logActivity({ actor: "bot", action: "expel_failed", level: "warning", customerId: target.customer_id, summary: `No se pudo sacar del canal: ${result.error}` });
  if (status === "failed" || !result.retryable) {
    await raiseAlert({
      code: "expulsion_failed",
      severity: "critical",
      title: "No se ha podido sacar a alguien del canal",
      detail: `${result.error}. Revisa los permisos del bot en «Canal» y pulsa «Reintentar» en su ficha.`,
      customerId: target.customer_id,
    });
    await notifyAdmin("problem", { cliente: null }, `expel_failed:${target.subscription_id}:${new Date().toISOString().slice(0, 13)}`);
  }
  return false;
}

/** Procesa las expulsiones pendientes que ya tocan. */
export async function processDueExpulsions(limit = 25): Promise<{ done: number; failed: number }> {
  const { data, error } = await db().rpc("vip_claim_expulsions", { p_limit: limit });
  if (error) throw new Error(`claim_expulsions_failed: ${error.message}`);
  let done = 0;
  let failed = 0;
  for (const row of (data ?? []) as Target[]) {
    if (await expel(row, "caducidad")) done++;
    else failed++;
  }
  return { done, failed };
}
