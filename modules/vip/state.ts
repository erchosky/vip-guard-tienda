/** Lógica pura del estado VIP (sin base de datos, fácil de probar). */
export type SubscriptionRow = {
  id: string;
  customer_id: string;
  status: "active" | "expired";
  started_at: string;
  last_extended_at: string;
  ends_at: string;
  last_plan_id: string | null;
  expired_at: string | null;
  expulsion_status: "none" | "pending" | "done" | "failed";
  expulsion_attempts: number;
  next_expulsion_attempt_at: string | null;
  last_expulsion_error: string | null;
  expelled_at: string | null;
  joined_channel_at: string | null;
  left_channel_at: string | null;
};

export type VipStatus = "active" | "expired" | "none";

export function vipStatus(sub: Pick<SubscriptionRow, "status" | "ends_at"> | null | undefined, now = new Date()): VipStatus {
  if (!sub) return "none";
  return sub.status === "active" && new Date(sub.ends_at).getTime() > now.getTime() ? "active" : "expired";
}

export type Plan = {
  id: string;
  name: string;
  description: string | null;
  duration_days: number;
  price_first_cents: number;
  price_renewal_cents: number;
  status: "active" | "hidden" | "archived";
  is_featured: boolean;
  sort_order: number;
};

/** Precio que le toca: alta si nunca ha pagado, renovación si ya pagó alguna vez. */
export function planPrice(plan: Pick<Plan, "price_first_cents" | "price_renewal_cents">, hasPaidBefore: boolean): number {
  return hasPaidBefore ? plan.price_renewal_cents : plan.price_first_cents;
}

export function durationLabel(days: number): string {
  if (days % 365 === 0) return days === 365 ? "1 año" : `${days / 365} años`;
  if (days % 30 === 0) return days === 30 ? "1 mes" : `${days / 30} meses`;
  if (days % 7 === 0) return days === 7 ? "1 semana" : `${days / 7} semanas`;
  return days === 1 ? "1 día" : `${days} días`;
}
