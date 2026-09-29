import "server-only";
import { db } from "@/modules/core/db";
import { logActivity, raiseAlert } from "@/modules/core/activity";
import { classifyTelegramError, failureLabel, tg } from "./client";
import type { Keyboard } from "./keyboard";

/**
 * Cola de mensajes del bot. Todo aviso que no sea una respuesta inmediata pasa
 * por aquí: se guarda con una clave de deduplicación, se envía con reintentos y
 * respeta los límites de Telegram. Nada se pierde ni se envía dos veces.
 */
export type OutboxMessage = {
  kind: string;
  chatId: number;
  customerId?: string | null;
  text: string;
  keyboard?: Keyboard;
  dedupeKey?: string;
};

type OutboxRow = {
  id: number;
  kind: string;
  chat_id: number;
  customer_id: string | null;
  payload: { text: string; keyboard?: Keyboard };
  attempts: number;
};

/** Tipos de mensaje cuyo fallo definitivo merece una alerta en el panel. */
const IMPORTANT_KINDS = new Set(["access", "renewal", "gift", "expired"]);

export async function enqueue(messages: OutboxMessage[]): Promise<number> {
  if (messages.length === 0) return 0;
  const rows = messages.map((m) => ({
    kind: m.kind,
    chat_id: m.chatId,
    customer_id: m.customerId ?? null,
    payload: { text: m.text.slice(0, 4096), ...(m.keyboard ? { keyboard: m.keyboard } : {}) },
    dedupe_key: m.dedupeKey ?? null,
  }));
  const { data, error } = await db()
    .from("message_outbox")
    .upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error(`outbox_enqueue_failed: ${error.message}`);
  return data?.length ?? 0;
}

export type DrainResult = { sent: number; retried: number; failed: number };

/** Envía mensajes pendientes hasta el límite o la hora tope. */
export async function drainOutbox({ limit = 25, deadline = Date.now() + 20_000 } = {}): Promise<DrainResult> {
  const result: DrainResult = { sent: 0, retried: 0, failed: 0 };
  const { data, error } = await db().rpc("outbox_claim", { p_limit: limit, p_lease_seconds: 60 });
  if (error) throw new Error(`outbox_claim_failed: ${error.message}`);
  const rows = (data ?? []) as OutboxRow[];

  for (const row of rows) {
    if (Date.now() > deadline) {
      // Se libera para el siguiente tick sin gastar un intento.
      await db().from("message_outbox").update({ status: "pending", attempts: Math.max(0, row.attempts - 1), next_attempt_at: new Date().toISOString() }).eq("id", row.id);
      continue;
    }
    try {
      await tg().sendMessage(row.chat_id, row.payload.text, {
        reply_markup: row.payload.keyboard ? { inline_keyboard: row.payload.keyboard } : undefined,
        link_preview_options: { is_disabled: true },
      });
      await db().rpc("outbox_complete", { p_id: row.id, p_ok: true });
      result.sent++;
    } catch (err) {
      const failure = classifyTelegramError(err);
      const permanent = failure.kind === "blocked" || failure.kind === "chat_not_found" || failure.kind === "bad_request";
      const { data: status } = await db().rpc("outbox_complete", {
        p_id: row.id,
        p_ok: false,
        p_error: failureLabel(failure),
        p_retry_after_seconds: failure.kind === "rate_limited" ? failure.retryAfter + 1 : null,
        p_permanent: permanent,
      });
      if (status === "failed") {
        result.failed++;
        await onPermanentFailure(row, failure.kind, failureLabel(failure));
      } else {
        result.retried++;
      }
      if (failure.kind === "rate_limited") break;
    }
  }
  return result;
}

async function onPermanentFailure(row: OutboxRow, kind: string, label: string) {
  if (row.customer_id && (kind === "blocked" || kind === "chat_not_found")) {
    await db().from("customers").update({ bot_blocked_at: new Date().toISOString() }).eq("id", row.customer_id).is("bot_blocked_at", null);
  }
  await logActivity({ actor: "bot", action: "message_failed", level: "warning", customerId: row.customer_id, summary: `No se pudo enviar un aviso (${row.kind}): ${label}`, data: { outbox_id: row.id } });
  if (IMPORTANT_KINDS.has(row.kind)) {
    await raiseAlert({
      code: "message_not_delivered",
      severity: "warning",
      title: "Un cliente no ha recibido un aviso importante",
      detail: `${label}. Puedes escribirle tú o copiar el enlace del canal desde su ficha.`,
      customerId: row.customer_id,
      data: { kind: row.kind, outbox_id: row.id },
    });
  }
}

/** Encola y envía al momento (lo que no salga ahora lo reintenta el programador). */
export async function sendNow(messages: OutboxMessage[]): Promise<void> {
  await enqueue(messages);
  try {
    await drainOutbox({ limit: Math.max(5, messages.length), deadline: Date.now() + 8_000 });
  } catch (error) {
    console.error("outbox_send_now_failed", error);
  }
}
