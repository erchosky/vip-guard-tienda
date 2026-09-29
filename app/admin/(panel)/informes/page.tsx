import type { Metadata } from "next";
import { Download } from "lucide-react";
import { PageHeader, Stat, EmptyState } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { MonthPicker, validMonth } from "@/components/admin/month-picker";
import { PrintButton } from "@/components/admin/print-button";
import { qs } from "@/components/admin/customer-list";
import { METHOD_LABEL } from "@/components/admin/bits";
import { db } from "@/modules/core/db";
import { euros } from "@/modules/core/money";
import { currentMonth, monthLabel, monthRange } from "@/modules/core/dates";

export const metadata: Metadata = { title: "Informes" };
export const dynamic = "force-dynamic";

type Report = {
  vip: { revenueCents: number; payments: number; newMembers: number; renewals: number; byMethod: Record<string, number> };
  shop: { revenueCents: number; shippingCents: number; sales: number; byMethod: Record<string, number> };
  interests: number;
  topCustomers: Array<{ id: string; username: string | null; first_name: string | null; spent_cents: number }>;
  topProducts: Array<{ product_title: string; sales: number; revenue_cents: number }>;
};

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const month = validMonth(sp.mes, currentMonth());
  const { from, to } = monthRange(month);
  const { data } = await db().rpc("admin_period_report", { p_from: from.toISOString(), p_to: to.toISOString() });
  const r = data as Report;
  const methods = new Set([...Object.keys(r.vip.byMethod ?? {}), ...Object.keys(r.shop.byMethod ?? {})]);
  return (
    <>
      <PageHeader title={<span>Informe de <span className="capitalize">{monthLabel(month)}</span></span>} description="Resumen del mes. Pulsa «Guardar como PDF» para quedártelo." actions={<PrintButton />} />
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <MonthPicker month={month} hrefFor={(m) => qs("/admin/informes", { mes: m })} />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total ingresado" value={euros(r.vip.revenueCents + r.shop.revenueCents)} tone="success" />
        <Stat label="VIP" value={euros(r.vip.revenueCents)} hint={`${r.vip.newMembers} altas · ${r.vip.renewals} renovaciones`} />
        <Stat label="Tienda" value={euros(r.shop.revenueCents)} hint={`${r.shop.sales} ventas · envíos ${euros(r.shop.shippingCents)}`} />
        <Stat label="«Me interesa»" value={r.interests} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Por método de pago" />
          <CardBody>
            {methods.size ? (
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted"><tr><th className="pb-2">Método</th><th className="pb-2 text-right">VIP</th><th className="pb-2 text-right">Tienda</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {[...methods].map((m) => (
                    <tr key={m}><td className="py-2">{METHOD_LABEL[m] ?? m}</td><td className="py-2 text-right tabular-nums">{euros(r.vip.byMethod?.[m] ?? 0)}</td><td className="py-2 text-right tabular-nums">{euros(r.shop.byMethod?.[m] ?? 0)}</td></tr>
                  ))}
                </tbody>
              </table>
            ) : <EmptyState title="Sin ingresos este mes" />}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Mejores clientes" />
          {r.topCustomers.length ? (
            <ol className="divide-y divide-line">
              {r.topCustomers.map((c, i) => (
                <li key={c.id} className="flex items-center gap-3 px-4 py-2.5 text-sm sm:px-5">
                  <span className="w-5 text-muted">{i + 1}.</span>
                  <span className="min-w-0 flex-1 truncate">{c.first_name ?? "—"}{c.username ? <span className="text-muted"> @{c.username}</span> : null}</span>
                  <span className="font-semibold tabular-nums">{euros(c.spent_cents)}</span>
                </li>
              ))}
            </ol>
          ) : <EmptyState title="Nadie todavía" />}
        </Card>
        <Card>
          <CardHeader title="Productos más vendidos" />
          {r.topProducts.length ? (
            <ol className="divide-y divide-line">
              {r.topProducts.map((p, i) => (
                <li key={p.product_title} className="flex items-center gap-3 px-4 py-2.5 text-sm sm:px-5">
                  <span className="w-5 text-muted">{i + 1}.</span>
                  <span className="min-w-0 flex-1 truncate">{p.product_title}</span>
                  <span className="text-xs text-muted">×{p.sales}</span>
                  <span className="font-semibold tabular-nums">{euros(p.revenue_cents)}</span>
                </li>
              ))}
            </ol>
          ) : <EmptyState title="Sin ventas" />}
        </Card>
      </div>
      <Card className="no-print mt-6">
        <CardHeader title="Descargar en Excel" description="Archivos que abren directamente en Excel o Numbers." />
        <CardBody className="flex flex-wrap gap-2">
          <LinkButton download variant="secondary" href={qs("/api/admin/export/pagos", { mes: month })} icon={<Download className="h-4 w-4" />}>Pagos VIP del mes</LinkButton>
          <LinkButton download variant="secondary" href={qs("/api/admin/export/ventas", { mes: month })} icon={<Download className="h-4 w-4" />}>Ventas del mes</LinkButton>
          <LinkButton download variant="secondary" href="/api/admin/export/pagos" icon={<Download className="h-4 w-4" />}>Todos los pagos VIP</LinkButton>
          <LinkButton download variant="secondary" href="/api/admin/export/ventas" icon={<Download className="h-4 w-4" />}>Todas las ventas</LinkButton>
          <LinkButton download variant="secondary" href="/api/admin/export/clientes" icon={<Download className="h-4 w-4" />}>Clientes</LinkButton>
          <LinkButton download variant="secondary" href="/api/admin/export/miembros" icon={<Download className="h-4 w-4" />}>Miembros VIP</LinkButton>
          <LinkButton download variant="secondary" href="/api/admin/export/intereses" icon={<Download className="h-4 w-4" />}>Intereses</LinkButton>
        </CardBody>
      </Card>
    </>
  );
}
