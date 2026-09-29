import type { NextRequest } from "next/server";
import { z } from "zod";
import { fail, ok } from "@/modules/core/http";
import { readBoundedJson } from "@/modules/core/json";
import { checkRateLimit } from "@/modules/core/security/rate-limit";
import { AppError } from "@/modules/core/errors";
import { authenticateMiniApp } from "@/modules/telegram/miniapp-auth";
import { requestPlan } from "@/modules/vip/requests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({ planId: z.string().uuid() });

export async function POST(request: NextRequest) {
  try {
    const { customer } = await authenticateMiniApp(request);
    const limit = await checkRateLimit(`plan:${customer.id}`, 10, 10 * 60_000);
    if (!limit.allowed) throw new AppError("rate_limited", "Has pulsado muchas veces. Espera un poco.", 429);
    const input = body.safeParse(await readBoundedJson(request, { maxBytes: 2_048 }));
    if (!input.success) throw new AppError("invalid", "Plan no válido.", 400);
    const result = await requestPlan(customer, input.data.planId);
    return ok({ message: result.text, url: result.url });
  } catch (error) {
    return fail(error);
  }
}
