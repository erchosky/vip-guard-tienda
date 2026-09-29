import "server-only";
import { db, must } from "@/modules/core/db";
import { AppError } from "@/modules/core/errors";

export type Customer = {
  id: string;
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  language_code: string | null;
  started_bot_at: string | null;
  bot_blocked_at: string | null;
  is_banned: boolean;
  notes: string | null;
  tags: string[];
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
};

export const CUSTOMER_COLUMNS =
  "id, telegram_id, username, first_name, last_name, language_code, started_bot_at, bot_blocked_at, is_banned, notes, tags, first_seen_at, last_seen_at, created_at";

export type TelegramProfile = {
  id: number;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  language_code?: string | null;
};

/**
 * Crea o actualiza el cliente a partir de su perfil de Telegram sin tocar
 * notas, etiquetas ni fechas de alta.
 */
export async function upsertCustomer(profile: TelegramProfile, options: { startedBot?: boolean } = {}): Promise<Customer> {
  const now = new Date().toISOString();
  const row = {
    telegram_id: profile.id,
    username: profile.username ?? null,
    first_name: profile.first_name ?? null,
    last_name: profile.last_name ?? null,
    language_code: profile.language_code ?? null,
    last_seen_at: now,
  };
  const customer = await must<Customer>(
    db().from("customers").upsert(row, { onConflict: "telegram_id" }).select(CUSTOMER_COLUMNS).single(),
    "upsert_customer",
  );
  if (options.startedBot && (!customer.started_bot_at || customer.bot_blocked_at)) {
    const patch = { started_bot_at: customer.started_bot_at ?? now, bot_blocked_at: null };
    await db().from("customers").update(patch).eq("id", customer.id);
    return { ...customer, ...patch };
  }
  return customer;
}

export async function getCustomer(id: string): Promise<Customer> {
  const data = await must<Customer | null>(db().from("customers").select(CUSTOMER_COLUMNS).eq("id", id).maybeSingle(), "get_customer");
  if (!data) throw new AppError("customer_not_found", "No se encuentra ese cliente.", 404);
  return data;
}

export async function getCustomerByTelegramId(telegramId: number): Promise<Customer | null> {
  return must<Customer | null>(db().from("customers").select(CUSTOMER_COLUMNS).eq("telegram_id", telegramId).maybeSingle(), "get_customer_tg");
}

export async function updateCustomerNotes(id: string, notes: string, tags: string[]) {
  const cleanTags = [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20);
  await must(db().from("customers").update({ notes: notes.trim() || null, tags: cleanTags }).eq("id", id), "update_customer_notes");
}

export async function setBanned(id: string, banned: boolean) {
  await must(db().from("customers").update({ is_banned: banned }).eq("id", id), "set_banned");
}

export async function markBotBlocked(telegramId: number, blocked: boolean) {
  await db().from("customers").update({ bot_blocked_at: blocked ? new Date().toISOString() : null }).eq("telegram_id", telegramId);
}

export type CustomerListRow = {
  id: string;
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  tags: string[];
  is_banned: boolean;
  bot_blocked_at: string | null;
  created_at: string;
  last_seen_at: string;
  sub_status: "none" | "active" | "expired";
  ends_at: string | null;
  started_at: string | null;
  expulsion_status: string | null;
  joined_channel_at: string | null;
  total_spent_cents: number;
  purchases_count: number;
  vip_payments_count: number;
  total_count: number;
};

export type CustomerFilter = "all" | "members" | "active" | "expiring" | "expired" | "buyers" | "no_vip" | "problems";
export type CustomerSort = "recent" | "spent" | "ends" | "purchases";

export async function listCustomers(params: { search?: string; filter?: CustomerFilter; sort?: CustomerSort; page?: number; pageSize?: number }) {
  const pageSize = params.pageSize ?? 25;
  const page = Math.max(1, params.page ?? 1);
  const rows = await must<CustomerListRow[]>(
    db().rpc("admin_customers", {
      p_search: params.search?.slice(0, 80) ?? null,
      p_filter: params.filter ?? "all",
      p_sort: params.sort ?? "recent",
      p_limit: pageSize,
      p_offset: (page - 1) * pageSize,
    }),
    "list_customers",
  );
  return { rows, total: Number(rows[0]?.total_count ?? 0), page, pageSize };
}
