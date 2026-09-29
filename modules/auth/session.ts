import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { env } from "@/modules/core/env";
import { db } from "@/modules/core/db";
import { safeEqual } from "@/modules/core/security/secrets";
import { checkRateLimit, requestIp } from "@/modules/core/security/rate-limit";
import { assertSameOrigin } from "@/modules/core/security/origin";
import { AppError } from "@/modules/core/errors";
import { ADMIN_COOKIE, readAdminTokenPayload, signAdminToken } from "./admin-token";

export { ADMIN_COOKIE };

const SESSION_DAYS = 30;
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/**
 * Sesiones del panel: la cookie lleva un token firmado y la base de datos solo
 * guarda su hash, así que se pueden revocar. Duran 30 días para no tener que
 * iniciar sesión cada día desde el móvil.
 */
export async function login(password: unknown): Promise<"ok" | "invalid" | "rate_limited"> {
  const incoming = await headers();
  const ip = requestIp(incoming);
  const limit = await checkRateLimit(`admin-login:${ip}`, 5, 15 * 60_000);
  if (!limit.allowed) return "rate_limited";
  if (!safeEqual(password, env().ADMIN_PASSWORD)) return "invalid";

  const id = randomUUID();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  const { error } = await db().from("admin_sessions").insert({
    id,
    token_hash: sha256(token),
    expires_at: expiresAt.toISOString(),
    user_agent: incoming.get("user-agent")?.slice(0, 300) ?? null,
    ip_hash: sha256(ip),
  });
  if (error) throw new Error(`admin_session_create_failed: ${error.message}`);
  const jwt = await signAdminToken(env().SESSION_SECRET, { session_id: id, session_token: token }, expiresAt);
  (await cookies()).set(ADMIN_COOKIE, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return "ok";
}

async function currentPayload() {
  return readAdminTokenPayload((await cookies()).get(ADMIN_COOKIE)?.value, env().SESSION_SECRET);
}

export async function isAdmin(): Promise<boolean> {
  const payload = await currentPayload();
  if (!payload) return false;
  const { data, error } = await db().from("admin_sessions").select("token_hash, expires_at, revoked_at, last_seen_at").eq("id", payload.session_id).maybeSingle();
  if (error || !data || data.revoked_at) return false;
  if (new Date(data.expires_at).getTime() <= Date.now()) return false;
  if (data.token_hash !== sha256(payload.session_token)) return false;
  if (!data.last_seen_at || Date.now() - new Date(data.last_seen_at).getTime() > 10 * 60_000) {
    await db().from("admin_sessions").update({ last_seen_at: new Date().toISOString() }).eq("id", payload.session_id);
  }
  return true;
}

/** Para páginas del panel: redirige al login si no hay sesión. */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect("/admin/login");
}

/** Para acciones del panel: sesión + mismo origen (anti-CSRF) + límite de ritmo. */
export async function requireAdminAction(): Promise<void> {
  try {
    await assertSameOrigin();
  } catch {
    throw new AppError("bad_origin", "Petición no permitida. Recarga la página.", 403);
  }
  if (!(await isAdmin())) redirect("/admin/login");
  const payload = await currentPayload();
  const limit = await checkRateLimit(`admin-action:${payload?.session_id ?? "anon"}`, 120, 60_000);
  if (!limit.allowed) throw new AppError("rate_limited", "Demasiadas acciones seguidas. Espera un minuto.", 429);
}

export async function logout(all = false) {
  const payload = await currentPayload();
  const now = new Date().toISOString();
  if (all) await db().from("admin_sessions").update({ revoked_at: now }).is("revoked_at", null);
  else if (payload) await db().from("admin_sessions").update({ revoked_at: now }).eq("id", payload.session_id);
  (await cookies()).delete(ADMIN_COOKIE);
}
