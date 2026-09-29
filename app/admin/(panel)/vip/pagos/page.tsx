import type { Metadata } from "next";
import Link from "next/link";
import { Download, Wallet } from "lucide-react";
import { PageHeader, Stat, EmptyState, FilterChips } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Avatar, customerName, KIND_LABEL, METHOD_LABEL } from "@/components/admin/bits";
import { VoidForm } from "@/components/admin/customer-forms";
import { MonthPicker, validMonth } from "@/components/admin/month-picker";
import { qs } from "@/components/admin/customer-list";
import { db } from "@/modules/core/db";
import { euros } from "@/modules/core/money";
import { currentMonth, formatShort, monthRange } from "@/modules/core/dates";
import { voidPaymentAction } from "../actions";

export const metadata: Metadata = { title: "Pagos VIP" };
export const dynamic = "force-dynamic";

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const month = validMonth(sp.mes, currentMonth());
  const method = sp.metodo && METHOD_LABEL[sp.metodo] ? sp.metodo : "todos";
  const { from, to } = monthRange(month);
  let query = db()
    .from("vip_payments")
    .select("*, customers(id, first_name, last_name, username, telegram_id)")
    .in("kind", ["first", "renewal"])
    .gte("created_at", from.toISOString())
    .lt("created_at", to.toISOString())
    .order("created_at", { ascending: false })
    .limit(500);
  if (method !== "todos") query = query.eq("method", method);
  const { data } = await query;
  const rows = data ?? [];
  const valid = rows.filter((r) => !r.voided_at);
  const total = valid.reduce((sum, r) => sum + (r.amount_cents as number), 0);
  const byMethod = new Map<string, number>();
  for (const r of valid) byMethod.set(r.method as string, (byMethod.get(r.method as string) ?? 0) + (r.amount_cents as number));

  return (
    <>
      <PageHeader
        title="Pagos VIP"
        description="Todo lo cobrado por el VIP. Para registrar un pago, abre la ficha del cliente."
        actions={<LinkButton download href={qs("/api/admin/export/pagos", { mes: month })} variant="secondary" icon={<Download className="h-4 w-4" />}>Excel del mes</LinkButton>}
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <MonthPicker month={month} hrefFor={(m) => qs("/admin/vip/pagos", { mes: m, metodo: method === "todos" ? undefined : method })} />
        <FilterChips active={method} items={[{ key: "todos", label: "Todos", href: qs("/admin/vip/pagos", { mes: month }) }, ...Object.entries(METHOD_LABEL).map(([k, label]) => ({ key: k, label, href: qs("/admin/vip/pagos", { mes: month, metodo: k }) }))]} />
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total cobrado" value={euros(total)} tone="accent" hint={`${valid.length} pagos`} />
        <Stat label="Altas" value={valid.filter((r) => r.kind === "first").length} />
        <Stat label="Renovaciones" value={valid.filter((r) => r.kind === "renewal").length} />
        <Stat label="Por método" value={<span className="text-base">{[...byMethod.entries()].map(([m, c]) => `${METHOD_LABEL[m]} ${euros(c)}`).join(" · ") || "—"}</span>} />
      </div>
      <Card className="overflow-hidden">
        {rows.length === 0 ? <EmptyState icon={<Wallet className="h-5 w-5" />} title="No hay pagos este mes" /> : (
          <ul className="divide-y divide-line">
            {rows.map((p) => {
              const c = p.customers as unknown as { id: string; first_name: string | null; last_name: string | null; username: string | null; telegram_id: number };
              return (
                <li key={p.id as string} className={`flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5 ${p.voided_at ? "opacity-50" : ""}`}>
                  <Avatar name={customerName(c)} />
                  <Link href={`/admin/clientes/${c.id}`} className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium hover:underline">{customerName(c)}</span>
                    <span className="block text-xs text-muted">{formatShort(p.created_at as string)} · {p.plan_name as string} · {METHOD_LABEL[p.method as string]}{p.voided_at ? ` · anulado${p.void_reason ? `: ${p.void_reason}` : ""}` : ""}</span>
                  </Link>
                  <Badge tone={p.kind === "first" ? "accent" : "success"}>{KIND_LABEL[p.kind as string]}</Badge>
                  <span className="w-20 text-right text-sm font-semibold tabular-nums">{euros(p.amount_cents as number)}</span>
                  {!p.voided_at ? <VoidForm action={voidPaymentAction} idName="paymentId" id={p.id as string} /> : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
