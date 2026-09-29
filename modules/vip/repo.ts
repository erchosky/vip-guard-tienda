import "server-only";
import { db, must } from "@/modules/core/db";
import { AppError } from "@/modules/core/errors";
import type { Plan, SubscriptionRow } from "./state";

export const SUB_COLUMNS =
  "id, customer_id, status, started_at, last_extended_at, ends_at, last_plan_id, expired_at, expulsion_status, expulsion_attempts, next_expulsion_attempt_at, last_expulsion_error, expelled_at, joined_channel_at, left_channel_at";

export async function getSubscription(customerId: string): Promise<SubscriptionRow | null> {
  return must<SubscriptionRow | null>(db().from("subscriptions").select(SUB_COLUMNS).eq("customer_id", customerId).maybeSingle(), "get_subscription");
}

export async function hasPaidBefore(customerId: string): Promise<boolean> {
  const { count, error } = await db()
    .from("vip_payments")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", customerId)
    .in("kind", ["first", "renewal"])
    .is("voided_at", null);
  if (error) throw new AppError("db_error", "No se pudo leer el historial de pagos.", 500);
  return (count ?? 0) > 0;
}

export async function listPlans(options: { includeHidden?: boolean; includeArchived?: boolean } = {}): Promise<Plan[]> {
  const statuses = ["active", ...(options.includeHidden ? ["hidden"] : []), ...(options.includeArchived ? ["archived"] : [])];
  return must<Plan[]>(
    db().from("vip_plans").select("id, name, description, duration_days, price_first_cents, price_renewal_cents, status, is_featured, sort_order").in("status", statuses).order("sort_order").order("duration_days"),
    "list_plans",
  );
}

export async function getPlan(id: string): Promise<Plan> {
  const plan = await must<Plan | null>(db().from("vip_plans").select("*").eq("id", id).maybeSingle(), "get_plan");
  if (!plan) throw new AppError("plan_not_found", "Ese plan no existe.", 404);
  return plan;
}

export type ChannelRow = {
  telegram_chat_id: number | null;
  title: string | null;
  invite_link: string | null;
  auto_expel: boolean;
  reminders_enabled: boolean;
  last_check: ChannelCheck | Record<string, never>;
  last_checked_at: string | null;
};

export type ChannelCheck = {
  ok: boolean;
  found: boolean;
  isChannel: boolean;
  botAdmin: boolean;
  canInvite: boolean;
  canRestrict: boolean;
  protectedContent: boolean | null;
  title: string | null;
  error?: string;
};

export async function getChannel(): Promise<ChannelRow> {
  const row = await must<ChannelRow | null>(
    db().from("vip_channel").select("telegram_chat_id, title, invite_link, auto_expel, reminders_enabled, last_check, last_checked_at").eq("id", 1).maybeSingle(),
    "get_channel",
  );
  return row ?? { telegram_chat_id: null, title: null, invite_link: null, auto_expel: true, reminders_enabled: true, last_check: {}, last_checked_at: null };
}

export async function updateChannel(patch: Partial<Omit<ChannelRow, "last_check">> & { last_check?: ChannelCheck }) {
  await must(db().from("vip_channel").upsert({ id: 1, ...patch }, { onConflict: "id" }), "update_channel");
}
