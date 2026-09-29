import Link from "next/link";
import { Suspense } from "react";
import { AlertTriangle, Crown } from "lucide-react";
import { PageHeader, Stat, EmptyState } from "@/components/ui/misc";
import { Card, CardHeader } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, SetupChecklist, VipBadge, customerName, METHOD_LABEL, KIND_LABEL } from "@/components/admin/bits";
import { db } from "@/modules/core/db";
import { euros } from "@/modules/core/money";
import { formatDateTime, formatShort } from "@/modules/core/dates";
import { setupStatus } from "@/modules/admin/health";

export const dynamic = "force-dynamic";

type Overview = Record<string, number>;

export default async function VipHome() {
  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 86_400_000).toISOString();
  const [{ data: overview }, expiring, alerts, payments] = await Promise.all([
    db().rpc("admin_overview"),
    db().from("subscriptions").select("ends_at, customers(id, first_name, last_name, username, telegram_id)").eq("status", "active").gt("ends_at", now.toISOString()).lte("ends_at", in7).order("ends_at").limit(8),
    db().from("alerts").select("id, title, detail, severity, last_seen_at, customer_id").eq("status", "open").order("last_seen_at", { ascending: false }).limit(5),
    db().from("vip_payments").select("id, kind, amount_cents, method, created_at, customers(id, first_name, last_name, username, telegram_id)").is("voided_at", null).in("kind", ["first", "renewal"]).order("created_at", { ascending: false }).limit(6),
  ]);
  const o = (overview ?? {}) as Overview;

  return (
    <>
      <PageHeader title="VIP Guard" description="Tu canal VIP de un vistazo." actions={<LinkButton href="/admin/vip/miembros?f=all" icon={<Crown className="h-4 w-4" />}>Registrar pago</LinkButton>} />
      <Suspense fallback={null}>
        <Checklist />
      </Suspense>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Miembros activos" value={o.activeMembers ?? 0} href="/admin/vip/miembros" tone="accent" />
        <Stat label="Caducan en 3 días" value={o.expiringSoon ?? 0} href="/admin/vip/miembros?f=expiring" tone={o.expiringSoon ? "warning" : undefined} />
        <Stat label="Ingresos VIP del mes" value={euros(o.vipRevenueMonthCents)} href="/admin/vip/pagos" />
        <Stat label="Altas / renovaciones" value={`${o.newMembersMonth ?? 0} / ${o.renewalsMonth ?? 0}`} hint="este mes" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Caducan pronto" description="Próximos 7 días" actions={<Link href="/admin/vip/miembros?f=expiring" className="link text-sm">Ver todos</Link>} />
          {expiring.data?.length ? (
            <ul className="divide-y divide-line">
              {expiring.data.map((row) => {
                const c = row.customers as unknown as { id: string; first_name: string | null; last_name: string | null; username: string | null; telegram_id: number };
                return (
                  <li key={c.id}>
                    <Link href={`/admin/clientes/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-subtle sm:px-5">
                      <Avatar name={customerName(c)} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{customerName(c)}</span>
                        <span className="block text-xs text-muted">{c.username ? `@${c.username}` : "sin @usuario"}</span>
                      </span>
                      <VipBadge status="active" endsAt={row.ends_at as string} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : <EmptyState title="Nadie caduca esta semana" />}
        </Card>

        <Card>
          <CardHeader title="Alertas" actions={<Link href="/admin/vip/actividad" className="link text-sm">Ver historial</Link>} />
          {alerts.data?.length ? (
            <ul className="divide-y divide-line">
              {alerts.data.map((a) => (
                <li key={a.id as string} className="flex gap-3 px-4 py-3 sm:px-5">
                  <AlertTriangle className={a.severity === "critical" ? "mt-0.5 h-4 w-4 shrink-0 text-danger" : "mt-0.5 h-4 w-4 shrink-0 text-warning"} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{a.title as string}</p>
                    {a.detail ? <p className="text-[13px] text-muted">{a.detail as string}</p> : null}
                    <p className="mt-0.5 text-xs text-muted">{formatDateTime(a.last_seen_at as string)}{a.customer_id ? <> · <Link className="link" href={`/admin/clientes/${a.customer_id}`}>ver cliente</Link></> : null}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : <EmptyState title="Todo en orden" description="No hay nada que revisar." />}
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Últimos pagos" actions={<Link href="/admin/vip/pagos" className="link text-sm">Ver todos</Link>} />
        {payments.data?.length ? (
          <ul className="divide-y divide-line">
            {payments.data.map((p) => {
              const c = p.customers as unknown as { id: string; first_name: string | null; last_name: string | null; username: string | null; telegram_id: number };
              return (
                <li key={p.id as string}>
                  <Link href={`/admin/clientes/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-subtle sm:px-5">
                    <Avatar name={customerName(c)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{customerName(c)}</span>
                      <span className="block text-xs text-muted">{formatShort(p.created_at as string)} · {METHOD_LABEL[p.method as string] ?? p.method}</span>
                    </span>
                    <Badge tone={p.kind === "first" ? "accent" : "neutral"}>{KIND_LABEL[p.kind as string]}</Badge>
                    <span className="w-20 text-right text-sm font-semibold tabular-nums">{euros(p.amount_cents as number)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : <EmptyState title="Aún no hay pagos" description="Cuando registres el primero aparecerá aquí." />}
      </Card>
    </>
  );
}

async function Checklist() {
  const { items } = await setupStatus();
  return <SetupChecklist items={items} />;
}
