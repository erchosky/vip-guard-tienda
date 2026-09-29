import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isAdmin } from "@/modules/auth/session";
import { db } from "@/modules/core/db";
import { currentMonth, formatShort, monthRange } from "@/modules/core/dates";
import { csvMoney, toCsv } from "@/modules/exports/csv";
import { logActivity } from "@/modules/core/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;
const name = (c: Row | null | undefined) => (c ? [c.first_name, c.last_name].filter(Boolean).join(" ") || (c.username ? `@${c.username}` : `ID ${c.telegram_id}`) : "");
const METHOD: Record<string, string> = { bizum: "Bizum", paypal: "PayPal", transferencia: "Transferencia", efectivo: "Efectivo", otro: "Otro" };
const KIND: Record<string, string> = { first: "Alta", renewal: "Renovación", gift: "Regalo", adjustment: "Ajuste" };
const STATUS: Record<string, string> = { active: "VIP activo", expired: "Caducado", none: "Sin VIP" };
const INTEREST: Record<string, string> = { new: "Nuevo", contacted: "Contactado", sold: "Vendido", discarded: "Descartado" };

async function allCustomers(filter: string) {
  const rows: Row[] = [];
  for (let offset = 0; offset < 50_000; offset += 200) {
    const { data, error } = await db().rpc("admin_customers", { p_filter: filter, p_sort: "spent", p_limit: 200, p_offset: offset });
    if (error) throw error;
    rows.push(...((data ?? []) as Row[]));
    if ((data ?? []).length < 200) break;
  }
  return rows;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ dataset: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ ok: false }, { status: 401 });
  const { dataset } = await params;
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(request.nextUrl.searchParams.get("mes") ?? "") ? request.nextUrl.searchParams.get("mes")! : null;
  const range = month ? monthRange(month) : null;
  let csv: string;
  let filename: string;

  try {
    if (dataset === "clientes" || dataset === "miembros") {
      const rows = await allCustomers(dataset === "miembros" ? "members" : "all");
      const notes = new Map<string, string | null>();
      const ids = rows.map((r) => r.id as string);
      for (let i = 0; i < ids.length; i += 500) {
        const { data } = await db().from("customers").select("id, notes").in("id", ids.slice(i, i + 500));
        for (const n of data ?? []) notes.set(n.id as string, n.notes as string | null);
      }
      csv = toCsv(rows, [
        { header: "Nombre", value: (r) => name(r) },
        { header: "Usuario de Telegram", value: (r) => (r.username as string) ?? "" },
        { header: "ID Telegram", value: (r) => String(r.telegram_id) },
        { header: "Estado VIP", value: (r) => STATUS[r.sub_status as string] },
        { header: "Fin VIP", value: (r) => (r.ends_at ? formatShort(r.ends_at as string) : "") },
        { header: "Pagos VIP", value: (r) => r.vip_payments_count as number },
        { header: "Compras tienda", value: (r) => r.purchases_count as number },
        { header: "Total gastado (€)", value: (r) => csvMoney(r.total_spent_cents as number) },
        { header: "Etiquetas", value: (r) => (r.tags as string[]).join(", ") },
        { header: "Cliente desde", value: (r) => formatShort(r.created_at as string) },
        { header: "Notas", value: (r) => notes.get(r.id as string) ?? "" },
      ]);
      filename = dataset;
    } else if (dataset === "pagos") {
      let q = db().from("vip_payments").select("*, customers(first_name, last_name, username, telegram_id)").order("created_at", { ascending: false }).limit(20_000);
      if (range) q = q.gte("created_at", range.from.toISOString()).lt("created_at", range.to.toISOString());
      const { data, error } = await q;
      if (error) throw error;
      csv = toCsv((data ?? []) as Row[], [
        { header: "Fecha", value: (r) => formatShort(r.created_at as string) },
        { header: "Cliente", value: (r) => name(r.customers as Row) },
        { header: "Usuario de Telegram", value: (r) => ((r.customers as Row)?.username as string) ?? "" },
        { header: "Tipo", value: (r) => KIND[r.kind as string] },
        { header: "Plan", value: (r) => r.plan_name as string },
        { header: "Importe (€)", value: (r) => csvMoney(r.amount_cents as number) },
        { header: "Método", value: (r) => METHOD[r.method as string] ?? "" },
        { header: "Días", value: (r) => r.days_added as number },
        { header: "VIP hasta", value: (r) => formatShort(r.new_ends_at as string) },
        { header: "Nota", value: (r) => r.note as string },
        { header: "Anulado", value: (r) => (r.voided_at ? `sí${r.void_reason ? ` (${r.void_reason})` : ""}` : "") },
      ]);
      filename = `pagos-vip${month ? `-${month}` : ""}`;
    } else if (dataset === "ventas") {
      let q = db().from("shop_sales").select("*, customers(first_name, last_name, username, telegram_id)").order("sold_at", { ascending: false }).limit(20_000);
      if (range) q = q.gte("sold_at", range.from.toISOString()).lt("sold_at", range.to.toISOString());
      const { data, error } = await q;
      if (error) throw error;
      csv = toCsv((data ?? []) as Row[], [
        { header: "Fecha", value: (r) => formatShort(r.sold_at as string) },
        { header: "Producto", value: (r) => r.product_title as string },
        { header: "Cliente", value: (r) => (r.customers ? name(r.customers as Row) : (r.buyer_label as string)) },
        { header: "Importe (€)", value: (r) => csvMoney(r.amount_cents as number) },
        { header: "Envío (€)", value: (r) => csvMoney(r.shipping_cents as number) },
        { header: "Método", value: (r) => METHOD[r.method as string] },
        { header: "Nota", value: (r) => r.note as string },
        { header: "Anulada", value: (r) => (r.voided_at ? `sí${r.void_reason ? ` (${r.void_reason})` : ""}` : "") },
      ]);
      filename = `ventas${month ? `-${month}` : ""}`;
    } else if (dataset === "intereses") {
      const { data, error } = await db().from("shop_interests").select("*, customers(first_name, last_name, username, telegram_id)").order("created_at", { ascending: false }).limit(20_000);
      if (error) throw error;
      csv = toCsv((data ?? []) as Row[], [
        { header: "Fecha", value: (r) => formatShort(r.created_at as string) },
        { header: "Último clic", value: (r) => formatShort(r.last_clicked_at as string) },
        { header: "Cliente", value: (r) => name(r.customers as Row) },
        { header: "Usuario de Telegram", value: (r) => ((r.customers as Row)?.username as string) ?? "" },
        { header: "Producto", value: (r) => r.product_title as string },
        { header: "Precio visto (€)", value: (r) => csvMoney(r.price_shown_cents as number) },
        { header: "Era VIP", value: (r) => r.was_vip as boolean },
        { header: "Clics", value: (r) => r.clicks as number },
        { header: "Estado", value: (r) => INTEREST[r.status as string] },
        { header: "Nota", value: (r) => r.admin_note as string },
      ]);
      filename = "intereses";
    } else {
      return NextResponse.json({ ok: false, error: "Exportación no válida" }, { status: 404 });
    }
  } catch (error) {
    console.error("export_failed", dataset, error);
    return NextResponse.json({ ok: false, error: "No se pudo generar el archivo" }, { status: 500 });
  }

  await logActivity({ actor: "admin", action: "export", summary: `Exportado: ${filename}` });
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}-${currentMonth()}.csv"`,
      "cache-control": "no-store",
    },
  });
}
