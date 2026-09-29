import type { NextRequest } from "next/server";
import { z } from "zod";
import { fail, ok } from "@/modules/core/http";
import { readBoundedJson } from "@/modules/core/json";
import { checkRateLimit } from "@/modules/core/security/rate-limit";
import { AppError } from "@/modules/core/errors";
import { authenticateMiniApp } from "@/modules/telegram/miniapp-auth";
import { registerInterest } from "@/modules/shop/interests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({ productId: z.string().uuid() });

export async function POST(request: NextRequest) {
  try {
    const { customer } = await authenticateMiniApp(request);
    const limit = await checkRateLimit(`interest:${customer.id}`, 20, 10 * 60_000);
    if (!limit.allowed) throw new AppError("rate_limited", "Has pulsado muchas veces. Espera un poco.", 429);
    const input = body.safeParse(await readBoundedJson(request, { maxBytes: 2_048 }));
    if (!input.success) throw new AppError("invalid", "Producto no válido.", 400);
    const result = await registerInterest(customer, input.data.productId);
    return ok({ message: result.message, url: result.url });
  } catch (error) {
    return fail(error);
  }
}
