import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { env } from "@/modules/core/env";
import { safeEqual } from "@/modules/core/security/secrets";
import { readBoundedJson } from "@/modules/core/json";
import { logActivity, raiseAlert } from "@/modules/core/activity";
import { AppError } from "@/modules/core/errors";
import { getBot } from "@/modules/telegram/bot";
import { claimUpdate, completeUpdate, releaseUpdate } from "@/modules/telegram/updates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const updateSchema = z.object({ update_id: z.number().int().nonnegative() }).passthrough();

/**
 * Webhook de Telegram. Cada update se procesa una sola vez (idempotencia en la
 * base de datos). Si falla la infraestructura se devuelve 500 para que
 * Telegram reintente; si falla la lógica se registra y no se reintenta, para
 * no entrar en bucles.
 */
export async function POST(request: NextRequest) {
  let secret: string;
  try {
    secret = env().TELEGRAM_WEBHOOK_SECRET;
  } catch (error) {
    console.error("webhook_config_error", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  if (!safeEqual(request.headers.get("x-telegram-bot-api-secret-token"), secret)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let update: z.infer<typeof updateSchema>;
  try {
    update = updateSchema.parse(await readBoundedJson(request, { maxBytes: 1_048_576 }));
  } catch {
    return NextResponse.json({ ok: true, ignored: true });
  }

  let claim;
  try {
    claim = await claimUpdate(update.update_id);
  } catch (error) {
    console.error("webhook_claim_failed", error);
    return NextResponse.json({ ok: false, retry: true }, { status: 500 });
  }
  if (!claim.claimed) {
    return claim.inProgress
      ? NextResponse.json({ ok: false, retry: true }, { status: 503, headers: { "Retry-After": "2" } })
      : NextResponse.json({ ok: true, duplicate: true });
  }

  try {
    const bot = await getBot();
    await bot.handleUpdate(update as Parameters<typeof bot.handleUpdate>[0]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Sin conexión con la base de datos o con Telegram: que Telegram reintente.
    const infra = (error instanceof AppError && error.code === "db_error") || /fetch failed|ECONNRESET|ETIMEDOUT|network|claim_update|outbox_/i.test(message);
    if (infra) {
      await releaseUpdate(update.update_id, claim.token);
      return NextResponse.json({ ok: false, retry: true }, { status: 500 });
    }
    console.error("webhook_handler_error", message);
    await logActivity({ actor: "bot", action: "bot_error", level: "error", summary: `Error del bot: ${message.slice(0, 200)}`, data: { update_id: update.update_id } });
    await raiseAlert({ code: "bot_error", severity: "warning", title: "El bot tuvo un error procesando un mensaje", detail: message.slice(0, 300) });
  }

  try {
    await completeUpdate(update.update_id, claim.token);
  } catch (error) {
    console.error("webhook_complete_failed", error);
  }
  return NextResponse.json({ ok: true });
}
