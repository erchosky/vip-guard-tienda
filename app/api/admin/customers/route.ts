import type { NextRequest } from "next/server";
import { fail, ok } from "@/modules/core/http";
import { AppError } from "@/modules/core/errors";
import { isAdmin } from "@/modules/auth/session";
import { listCustomers } from "@/modules/customers/repo";

export const dynamic = "force-dynamic";

/** Buscador de clientes para los formularios del panel. */
export async function GET(request: NextRequest) {
  try {
    if (!(await isAdmin())) throw new AppError("unauthorized", "Inicia sesión de nuevo.", 401);
    const q = request.nextUrl.searchParams.get("q")?.slice(0, 60) ?? "";
    const { rows } = await listCustomers({ search: q, filter: "all", sort: q ? "recent" : "spent", pageSize: 8 });
    return ok(rows.map((r) => ({ id: r.id, name: [r.first_name, r.last_name].filter(Boolean).join(" ") || null, username: r.username, telegramId: r.telegram_id, vip: r.sub_status, purchases: r.purchases_count })));
  } catch (error) {
    return fail(error);
  }
}
