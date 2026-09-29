import type { Metadata } from "next";
import Link from "next/link";
import { Download, Receipt } from "lucide-react";
import { PageHeader, Stat, EmptyState } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { SaleForm } from "@/components/admin/sale-form";
import { VoidForm } from "@/components/admin/customer-forms";
import { MonthPicker, validMonth } from "@/components/admin/month-picker";
import { qs } from "@/components/admin/customer-list";
import { METHOD_LABEL, customerName } from "@/components/admin/bits";
import { db } from "@/modules/core/db";
import { euros } from "@/modules/core/money";
import { currentMonth, formatShort, monthRange } from "@/modules/core/dates";
import { isOfferActive } from "@/modules/shop/pricing";
import type { ProductRow } from "@/modules/shop/types";
import { registerSaleAction, voidSaleAction } from "../actions";

export const metadata: Metadata = { title: "Ventas" };
export const dynamic = "force-dynamic";

export default async function SalesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const month = validMonth(sp.mes, currentMonth());
  const { from, to } = monthRange(month);
  const [products, sales, preCustomer] = await Promise.all([
    db().from("shop_products").select("*").or("status.in.(available,reserved),and(is_unique.eq.false,status.neq.archived)").order("title").limit(500),
    db().from("shop_sales").select("*, customers(id, first_name, last_name, username, telegram_id)").gte("sold_at", from.toISOString()).lt("sold_at", to.toISOString()).order("sold_at", { ascending: false }).limit(500),
    sp.cliente && /^[0-9a-f-]{36}$/i.test(sp.cliente) ? db().from("customers").select("id, first_name, last_name, username, telegram_id").eq("id", sp.cliente).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const rows = sales.data ?? [];
  const valid = rows.filter((r) => !r.voided_at);
  const total = valid.reduce((sum, r) => sum + (r.amount_cents as number), 0);
  const shipping = valid.reduce((sum, r) => sum + (r.shipping_cents as number), 0);
  const productOptions = ((products.data ?? []) as ProductRow[]).map((p) => ({ id: p.id, title: p.title, priceCents: isOfferActive(p) ? (p.offer_price_cents as number) : p.price_cents, status: p.status }));
  const c = preCustomer.data as { id: string; first_name: string | null; last_name: string | null; username: string | null; telegram_id: number } | null;

  return (
    <>
      <PageHeader title="Ventas" description="Registra aquí cada venta para llevar las cuentas y el historial de cada cliente." actions={<LinkButton download href={qs("/api/admin/export/ventas", { mes: month })} variant="secondary" icon={<Download className="h-4 w-4" />}>Excel del mes</LinkButton>} />
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="h-fit lg:col-span-2">
          <CardHeader title="Registrar venta" />
          <CardBody><SaleForm action={registerSaleAction} products={productOptions} defaultProductId={sp.producto} customer={c ? { id: c.id, label: customerName(c) } : null} /></CardBody>
        </Card>
        <div className="space-y-4 lg:col-span-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <MonthPicker month={month} hrefFor={(m) => qs("/admin/tienda/ventas", { mes: m })} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Vendido" value={euros(total)} tone="accent" />
            <Stat label="Ventas" value={valid.length} />
            <Stat label="Envíos cobrados" value={euros(shipping)} />
          </div>
          <Card className="overflow-hidden">
            {rows.length === 0 ? <EmptyState icon={<Receipt className="h-5 w-5" />} title="Sin ventas este mes" /> : (
              <ul className="divide-y divide-line">
                {rows.map((s) => {
                  const cust = s.customers as unknown as { id: string; first_name: string | null; last_name: string | null; username: string | null; telegram_id: number } | null;
                  return (
                    <li key={s.id as string} className={`flex flex-wrap items-center gap-3 px-4 py-3 text-sm sm:px-5 ${s.voided_at ? "opacity-50" : ""}`}>
                      <span className="min-w-0 flex-1">
                        {s.product_id ? <Link className="font-medium hover:underline" href={`/admin/tienda/productos/${s.product_id}`}>{s.product_title as string}</Link> : <span className="font-medium">{s.product_title as string}</span>}
                        <span className="block text-xs text-muted">
                          {formatShort(s.sold_at as string)} · {METHOD_LABEL[s.method as string]} · {cust ? <Link className="link" href={`/admin/clientes/${cust.id}`}>{customerName(cust)}</Link> : (s.buyer_label as string)}
                          {(s.shipping_cents as number) ? ` · envío ${euros(s.shipping_cents as number)}` : ""}{s.voided_at ? ` · anulada${s.void_reason ? `: ${s.void_reason}` : ""}` : ""}
                        </span>
                      </span>
                      <span className="font-semibold tabular-nums">{euros(s.amount_cents as number)}</span>
                      {!s.voided_at ? <VoidForm action={voidSaleAction} idName="saleId" id={s.id as string} /> : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
