import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/modules/core/env";
import { safeEqual } from "@/modules/core/security/secrets";
import { runTick } from "@/modules/vip/scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Programador. Lo llama pg_cron cada minuto (POST) y Vercel Cron una vez al
 * día como respaldo (GET). Ambos mandan "Authorization: Bearer CRON_SECRET".
 */
async function handle(request: NextRequest) {
  if (!safeEqual(request.headers.get("authorization"), `Bearer ${env().CRON_SECRET}`)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try {
    const result = await runTick();
    return NextResponse.json({ ok: true, result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("tick_failed", error);
    return NextResponse.json({ ok: false, error: "tick_failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
