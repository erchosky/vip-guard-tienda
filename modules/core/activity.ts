import "server-only";
import { db } from "./db";

export type Actor = "admin" | "bot" | "sistema" | "cliente";

/**
 * Guarda una entrada en el historial. Nunca lanza: un fallo al registrar no
 * debe romper la operación principal.
 */
export async function logActivity(entry: {
  actor: Actor;
  action: string;
  summary: string;
  customerId?: string | null;
  level?: "info" | "warning" | "error";
  data?: Record<string, unknown>;
}): Promise<void> {
  try {
    const { error } = await db().from("activity_log").insert({
      actor: entry.actor,
      action: entry.action,
      summary: entry.summary.slice(0, 500),
      customer_id: entry.customerId ?? null,
      level: entry.level ?? "info",
      data: entry.data ?? {},
    });
    if (error) console.error("activity_log_failed", entry.action, error.message);
  } catch (error) {
    console.error("activity_log_failed", entry.action, error);
  }
}

/** Abre (o reaviva) una alerta visible en el panel. Nunca lanza. */
export async function raiseAlert(alert: {
  code: string;
  severity: "info" | "warning" | "critical";
  title: string;
  detail?: string;
  customerId?: string | null;
  data?: Record<string, unknown>;
}): Promise<void> {
  try {
    const { error } = await db().rpc("raise_alert", {
      p_code: alert.code,
      p_severity: alert.severity,
      p_title: alert.title,
      p_detail: alert.detail ?? null,
      p_customer_id: alert.customerId ?? null,
      p_data: alert.data ?? {},
    });
    if (error) console.error("raise_alert_failed", alert.code, error.message);
  } catch (error) {
    console.error("raise_alert_failed", alert.code, error);
  }
}

/** Cierra alertas abiertas de un código (p. ej. cuando el problema se arregla solo). */
export async function resolveAlerts(code: string, customerId?: string | null): Promise<void> {
  try {
    let query = db().from("alerts").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("code", code).eq("status", "open");
    query = customerId ? query.eq("customer_id", customerId) : query.is("customer_id", null);
    await query;
  } catch (error) {
    console.error("resolve_alert_failed", code, error);
  }
}
