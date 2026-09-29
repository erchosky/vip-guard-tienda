import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

/**
 * Cliente Supabase con service_role. SOLO SERVIDOR: la base de datos no tiene
 * políticas para anon/authenticated y todo pasa por aquí tras validar
 * initData de Telegram o la sesión admin.
 */
export type Db = SupabaseClient<any, "public", any>;

const store = globalThis as typeof globalThis & { __vipDb?: Db; __vipDbKey?: string };

export function db(): Db {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env();
  const key = `${SUPABASE_URL}:${SUPABASE_SERVICE_ROLE_KEY.slice(-8)}`;
  if (store.__vipDb && store.__vipDbKey === key) return store.__vipDb;
  store.__vipDb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-client-info": "vip-guard" } },
  });
  store.__vipDbKey = key;
  return store.__vipDb;
}

type PgResult<T> = { data: T | null; error: { message: string; code?: string; details?: string } | null };

/** Desenvuelve un resultado de Supabase lanzando AppError si hay error. */
export async function must<T>(query: PromiseLike<PgResult<T>>, context: string): Promise<T> {
  const { data, error } = await query;
  if (error) {
    const { dbError } = await import("./errors");
    throw dbError(error, context);
  }
  return data as T;
}
