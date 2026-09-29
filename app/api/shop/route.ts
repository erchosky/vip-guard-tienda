import type { NextRequest } from "next/server";
import { fail, ok } from "@/modules/core/http";
import { checkRateLimit } from "@/modules/core/security/rate-limit";
import { AppError } from "@/modules/core/errors";
import { authenticateMiniApp } from "@/modules/telegram/miniapp-auth";
import { loadMiniApp } from "@/modules/shop/miniapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Todo lo que necesita la MiniApp en una sola petición. */
export async function GET(request: NextRequest) {
  try {
    const { customer } = await authenticateMiniApp(request);
    const limit = await checkRateLimit(`miniapp:${customer.id}`, 60, 60_000);
    if (!limit.allowed) throw new AppError("rate_limited", "Vas muy rápido. Espera unos segundos.", 429);
    return ok(await loadMiniApp(customer));
  } catch (error) {
    return fail(error);
  }
}
