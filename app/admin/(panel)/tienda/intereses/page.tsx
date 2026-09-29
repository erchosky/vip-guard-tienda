import type { Metadata } from "next";
import Link from "next/link";
import { Download, MessageCircle, Sparkles } from "lucide-react";
import { PageHeader, EmptyState, FilterChips, Pagination } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Avatar, customerName } from "@/components/admin/bits";
import { InterestActions } from "@/components/admin/shop-forms";
import { qs } from "@/components/admin/customer-list";
import { db } from "@/modules/core/db";
import { euros } from "@/modules/core/money";
import { formatShort } from "@/modules/core/dates";
import { INTEREST_STATUS_LABELS, type InterestStatus } from "@/modules/shop/interests";
import { updateInterestAction } from "../actions";

export const metadata: Metadata = { title: "Intereses" };
export const dynamic = "force-dynamic";

const PAGE = 30;
const FILTERS: Array<{ key: InterestStatus | "all"; label: string }> = [
  { key: "new", label: "Nuevos" }, { key: "contacted", label: "Contactados" }, { key: "sold", label: "Vendidos" }, { key: "discarded", label: "Descartados" }, { key: "all", label: "Todos" },
];

export default async function InterestsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const status = FILTERS.find((x) => x.key === sp.estado)?.key ?? "new";
  const page = Number(sp.p) || 1;
  let query = db().from("shop_interests").select("*, customers(id, first_name, last_name, username, telegram_id)", { count: "exact" }).order("last_clicked_at", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  if (status !== "all") query = query.eq("status", status);
  const { data, count } = await query;
  return (
    <>
      <PageHeader title="Intereses" description="Quién ha pulsado «Me interesa». Cuando cierres la venta, regístrala para que cuente en su historial." actions={<LinkButton download href="/api/admin/export/intereses" variant="secondary" icon={<Download className="h-4 w-4" />}>Excel</LinkButton>} />
      <div className="mb-4"><FilterChips active={status} items={FILTERS.map((x) => ({ key: x.key, label: x.label, href: qs("/admin/tienda/intereses", { estado: x.key === "new" ? undefined : x.key }) }))} /></div>
      <Card className="overflow-visible">
        {data?.length ? (
          <ul className="divide-y divide-line">
            {data.map((i) => {
              const c = i.customers as unknown as { id: string; first_name: string | null; last_name: string | null; username: string | null; telegram_id: number };
              const chat = c.username ? `https://t.me/${c.username}` : `tg://user?id=${c.telegram_id}`;
              return (
                <li key={i.id as string} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                  <Avatar name={customerName(c)} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <Link className="font-medium hover:underline" href={`/admin/clientes/${c.id}`}>{customerName(c)}</Link>
                      <span className="text-muted"> → </span>
                      {i.product_id ? <Link className="font-medium hover:underline" href={`/admin/tienda/productos/${i.product_id}`}>{i.product_title as string}</Link> : <span>{i.product_title as string}</span>}
                    </p>
                    <p className="text-xs text-muted">
                      {formatShort(i.last_clicked_at as string)}{(i.clicks as number) > 1 ? ` · ${i.clicks} clics` : ""}
                      {i.price_shown_cents !== null ? ` · vio ${euros(i.price_shown_cents as number)}` : ""}{i.was_vip ? " · 👑 VIP" : ""}
                      {i.admin_note ? ` · 📝 ${i.admin_note}` : ""}
                    </p>
                  </div>
                  <Badge tone={i.status === "new" ? "accent" : i.status === "sold" ? "success" : "neutral"}>{INTEREST_STATUS_LABELS[i.status as InterestStatus]}</Badge>
                  <div className="flex w-full flex-wrap items-center gap-1.5 pl-12 sm:w-auto sm:pl-0">
                    <LinkButton href={chat} external size="sm" variant="soft" icon={<MessageCircle className="h-3.5 w-3.5" />}>Chat</LinkButton>
                    {i.status !== "sold" && i.product_id ? <LinkButton href={qs("/admin/tienda/ventas", { producto: i.product_id as string, cliente: c.id })} size="sm" variant="secondary">Vendido</LinkButton> : null}
                    <InterestActions action={updateInterestAction} id={i.id as string} status={i.status as string} note={i.admin_note as string | null} />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : <EmptyState icon={<Sparkles className="h-5 w-5" />} title="Nada por aquí" />}
        <Pagination page={page} pageSize={PAGE} total={count ?? 0} hrefFor={(n) => qs("/admin/tienda/intereses", { estado: status === "new" ? undefined : status, p: n })} />
      </Card>
    </>
  );
}
