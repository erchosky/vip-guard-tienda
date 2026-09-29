import { NextResponse } from "next/server";
import { env } from "@/modules/core/env";
import { signInitData } from "@/modules/telegram/initData";

export const dynamic = "force-dynamic";

/**
 * SOLO DESARROLLO: firma un initData de prueba para ver la MiniApp en el
 * navegador sin Telegram. En producción responde 404 siempre.
 */
export function GET(request: Request) {
  if (process.env.NODE_ENV !== "development") return new NextResponse(null, { status: 404 });
  const url = new URL(request.url);
  const id = Number(url.searchParams.get("user") ?? "700000001");
  const user = JSON.stringify({ id, first_name: url.searchParams.get("name") ?? "Alba", username: "demo_alba", language_code: "es" });
  const initData = signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), query_id: "dev", user }, env().TELEGRAM_BOT_TOKEN);
  return NextResponse.json({ initData });
}
