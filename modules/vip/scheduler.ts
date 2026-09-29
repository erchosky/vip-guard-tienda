import "server-only";
import { db } from "@/modules/core/db";
import { logActivity } from "@/modules/core/activity";
import { formatHuman, timeLeft } from "@/modules/core/dates";
import { drainOutbox, enqueue, type OutboxMessage } from "@/modules/telegram/outbox";
import { getSettings } from "@/modules/settings/repo";
import { listPlans } from "./repo";
import { getChannel } from "./repo";
import { messageContext } from "./context";
import { plansMessage } from "./messages";
import { processDueExpulsions } from "./expulsion";
import { cleanupOrphanMedia } from "@/modules/shop/media";

/**
 * Programador: se ejecuta cada minuto (pg_cron → /api/cron/tick) y una vez al
 * día desde Vercel como red de seguridad. Un bloqueo en la base de datos evita
 * que dos ejecuciones se solapen.
 */
export type TickResult = {
  skipped?: boolean;
  expired: number;
  expelled: number;
  expelFailed: number;
  reminders: number;
  sent: number;
  retried: number;
  failed: number;
  cleanup?: unknown;
  ms: number;
};

const JOB = "tick";

/** Qué clientes han pagado alguna vez (para enseñar precio de alta o de renovación). */
async function paidCustomers(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { data } = await db().from("vip_payments").select("customer_id").in("customer_id", ids).in("kind", ["first", "renewal"]).is("voided_at", null);
  return new Set((data ?? []).map((r) => r.customer_id as string));
}

export async function runTick(now = new Date()): Promise<TickResult> {
  const started = Date.now();
  const deadline = started + 45_000;
  const { data: token, error: lockError } = await db().rpc("claim_job_lock", { p_job_name: JOB, p_lease_seconds: 58 });
  if (lockError) throw new Error(`claim_job_lock_failed: ${lockError.message}`);
  if (!token) return { skipped: true, expired: 0, expelled: 0, expelFailed: 0, reminders: 0, sent: 0, retried: 0, failed: 0, ms: 0 };

  const result: TickResult = { expired: 0, expelled: 0, expelFailed: 0, reminders: 0, sent: 0, retried: 0, failed: 0, ms: 0 };
  let ok = true;
  let errorMessage: string | null = null;
  try {
    result.expired = await expireDue(now);
    const expulsions = await processDueExpulsions(25);
    result.expelled = expulsions.done;
    result.expelFailed = expulsions.failed;
    result.reminders = await enqueueReminders(now);
    while (Date.now() < deadline) {
      const drained = await drainOutbox({ limit: 25, deadline });
      result.sent += drained.sent;
      result.retried += drained.retried;
      result.failed += drained.failed;
      if (drained.sent + drained.retried + drained.failed < 25) break;
    }
    if (now.getUTCMinutes() === 30 && Date.now() < deadline - 10_000) {
      result.cleanup = await cleanupOrphanMedia().catch((error) => ({ error: String(error) }));
    }
  } catch (error) {
    ok = false;
    errorMessage = error instanceof Error ? error.message : String(error);
    await logActivity({ actor: "sistema", action: "tick_failed", level: "error", summary: `El programador falló: ${errorMessage}` });
  } finally {
    result.ms = Date.now() - started;
    await db().rpc("release_job_lock", { p_job_name: JOB, p_lease_token: token, p_ok: ok, p_result: result, p_error: errorMessage });
  }
  if (!ok) throw new Error(errorMessage ?? "tick_failed");
  return result;
}

async function expireDue(now: Date): Promise<number> {
  const { data, error } = await db().rpc("vip_expire_due", { p_now: now.toISOString(), p_limit: 100 });
  if (error) throw new Error(`expire_due_failed: ${error.message}`);
  const rows = (data ?? []) as Array<{ subscription_id: string; customer_id: string; telegram_id: number; ends_at: string; expel: boolean }>;
  if (rows.length === 0) return 0;

  const ctx = await messageContext();
  const plans = await listPlans();
  const paid = await paidCustomers(rows.map((r) => r.customer_id));
  const messages: OutboxMessage[] = rows.map((row) => {
    const offer = plansMessage(ctx, plans, paid.has(row.customer_id), null, ctx.t("bot.expired", {}));
    return {
      kind: "expired",
      chatId: Number(row.telegram_id),
      customerId: row.customer_id,
      text: offer.text,
      keyboard: offer.keyboard,
      dedupeKey: `expired:${row.subscription_id}:${new Date(row.ends_at).getTime()}`,
    };
  });
  await enqueue(messages);
  for (const row of rows) {
    await logActivity({ actor: "bot", action: "vip_expired", customerId: row.customer_id, summary: `VIP caducado (${formatHuman(row.ends_at)})${row.expel ? "" : " · autoexpulsión desactivada"}` });
  }
  return rows.length;
}

async function enqueueReminders(now: Date): Promise<number> {
  const [channel, vip] = await Promise.all([getChannel(), getSettings("vip")]);
  if (!channel.reminders_enabled || vip.reminderHours.length === 0) return 0;
  const { data, error } = await db().rpc("vip_due_reminders", { p_hours: vip.reminderHours, p_now: now.toISOString(), p_limit: 200 });
  if (error) throw new Error(`due_reminders_failed: ${error.message}`);
  const rows = (data ?? []) as Array<{ customer_id: string; telegram_id: number; first_name: string | null; ends_at: string; dedupe_key: string }>;
  if (rows.length === 0) return 0;
  const ctx = await messageContext();
  const plans = await listPlans();
  const paid = await paidCustomers(rows.map((r) => r.customer_id));
  const messages: OutboxMessage[] = rows.map((row) => {
    const text = ctx.t("bot.reminder", { nombre: row.first_name, tiempo_restante: timeLeft(row.ends_at, now), fecha_fin: formatHuman(row.ends_at) });
    return {
      kind: "reminder",
      chatId: Number(row.telegram_id),
      customerId: row.customer_id,
      text,
      keyboard: plansMessage(ctx, plans, paid.has(row.customer_id), row.first_name).keyboard,
      dedupeKey: row.dedupe_key,
    };
  });
  return enqueue(messages);
}
