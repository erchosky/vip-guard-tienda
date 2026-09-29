import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, History } from "lucide-react";
import { PageHeader, EmptyState, FilterChips, Pagination } from "@/components/ui/misc";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/admin/action-button";
import { qs } from "@/components/admin/customer-list";
import { db } from "@/modules/core/db";
import { formatShort } from "@/modules/core/dates";
import { resolveAlertAction } from "../actions";

export const metadata: Metadata = { title: "Alertas e historial" };
export const dynamic = "force-dynamic";

const ACTOR: Record<string, string> = { admin: "Panel", bot: "Bot", sistema: "Sistema", cliente: "Cliente" };
const PAGE = 40;

export default async function ActivityPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const filter = ["todo", "problemas", "panel", "clientes"].includes(sp.f ?? "") ? sp.f! : "todo";
  const page = Number(sp.p) || 1;
  let query = db().from("activity_log").select("id, at, actor, level, summary, customer_id", { count: "exact" }).order("at", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  if (filter === "problemas") query = query.neq("level", "info");
  if (filter === "panel") query = query.eq("actor", "admin");
  if (filter === "clientes") query = query.eq("actor", "cliente");
  const [alerts, log] = await Promise.all([
    db().from("alerts").select("*").eq("status", "open").order("last_seen_at", { ascending: false }).limit(50),
    query,
  ]);

  return (
    <>
      <PageHeader title="Alertas e historial" description="Lo que necesita tu atención y todo lo que ha pasado." />
      <Card className="mb-6">
        <CardHeader title="Alertas abiertas" actions={alerts.data?.length ? <ActionButton action={resolveAlertAction} variant="ghost" size="sm" confirm="¿Marcar todas como resueltas?">Resolver todas</ActionButton> : null} />
        {alerts.data?.length ? (
          <ul className="divide-y divide-line">
            {alerts.data.map((a) => (
              <li key={a.id as string} className="flex flex-wrap items-start gap-3 px-4 py-3 sm:px-5">
                <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${a.severity === "critical" ? "text-danger" : "text-warning"}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{a.title as string} {(a.occurrences as number) > 1 ? <Badge>×{a.occurrences as number}</Badge> : null}</p>
                  {a.detail ? <p className="text-[13px] text-muted">{a.detail as string}</p> : null}
                  <p className="mt-0.5 text-xs text-muted">{formatShort(a.last_seen_at as string)}{a.customer_id ? <> · <Link className="link" href={`/admin/clientes/${a.customer_id}`}>ver cliente</Link></> : null}</p>
                </div>
                <ActionButton action={resolveAlertAction} fields={{ id: a.id as string }} variant="secondary" size="sm">Resuelta</ActionButton>
              </li>
            ))}
          </ul>
        ) : <EmptyState icon={<CheckCircle2 className="h-5 w-5" />} title="Nada pendiente" />}
      </Card>

      <div className="mb-3">
        <FilterChips active={filter} items={[
          { key: "todo", label: "Todo", href: qs("/admin/vip/actividad", {}) },
          { key: "problemas", label: "Problemas", href: qs("/admin/vip/actividad", { f: "problemas" }) },
          { key: "panel", label: "Hecho desde el panel", href: qs("/admin/vip/actividad", { f: "panel" }) },
          { key: "clientes", label: "Clientes", href: qs("/admin/vip/actividad", { f: "clientes" }) },
        ]} />
      </div>
      <Card className="overflow-hidden">
        {log.data?.length ? (
          <ul className="divide-y divide-line">
            {log.data.map((row) => (
              <li key={row.id as number} className="flex items-start gap-3 px-4 py-2.5 sm:px-5">
                <span className="w-24 shrink-0 pt-0.5 text-xs tabular-nums text-muted">{formatShort(row.at as string)}</span>
                <Badge tone={row.level === "error" ? "danger" : row.level === "warning" ? "warning" : "neutral"}>{ACTOR[row.actor as string]}</Badge>
                <p className="min-w-0 flex-1 text-sm">
                  {row.summary as string}
                  {row.customer_id ? <> · <Link className="link" href={`/admin/clientes/${row.customer_id}`}>ficha</Link></> : null}
                </p>
              </li>
            ))}
          </ul>
        ) : <EmptyState icon={<History className="h-5 w-5" />} title="Sin actividad todavía" />}
        <Pagination page={page} pageSize={PAGE} total={log.count ?? 0} hrefFor={(p) => qs("/admin/vip/actividad", { f: filter === "todo" ? undefined : filter, p })} />
      </Card>
    </>
  );
}
