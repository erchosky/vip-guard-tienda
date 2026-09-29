import Link from "next/link";
import { Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState, Pagination } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Avatar, VipBadge, customerName } from "@/components/admin/bits";
import { euros } from "@/modules/core/money";
import { formatDate } from "@/modules/core/dates";
import type { CustomerListRow } from "@/modules/customers/repo";

export function CustomerList({ rows, total, page, pageSize, hrefFor, emptyTitle, emptyDescription, showSpent = true }: {
  rows: CustomerListRow[];
  total: number;
  page: number;
  pageSize: number;
  hrefFor: (page: number) => string;
  emptyTitle: string;
  emptyDescription?: string;
  showSpent?: boolean;
}) {
  return (
    <Card className="overflow-hidden">
      {rows.length === 0 ? (
        <EmptyState icon={<Users className="h-5 w-5" />} title={emptyTitle} description={emptyDescription} />
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((c) => (
            <li key={c.id}>
              <Link href={`/admin/clientes/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-subtle sm:px-5">
                <Avatar name={customerName(c)} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{customerName(c)}</span>
                    {c.is_banned ? <Badge tone="danger">Vetado</Badge> : null}
                    {c.bot_blocked_at ? <Badge tone="warning">Bloqueó el bot</Badge> : null}
                    {c.expulsion_status === "failed" ? <Badge tone="danger">Expulsión fallida</Badge> : null}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted">
                    {c.username ? `@${c.username}` : `ID ${c.telegram_id}`}
                    {c.tags.length ? ` · ${c.tags.map((t) => `#${t}`).join(" ")}` : ""}
                    {c.purchases_count ? ` · ${c.purchases_count} compra${c.purchases_count === 1 ? "" : "s"}` : ""}
                  </span>
                </span>
                <span className="hidden sm:block"><VipBadge status={c.sub_status} endsAt={c.ends_at} /></span>
                {showSpent ? <span className="hidden w-24 text-right text-sm font-semibold tabular-nums md:block">{euros(c.total_spent_cents)}</span> : null}
                <span className="hidden w-28 text-right text-xs text-muted lg:block">desde {formatDate(c.created_at)}</span>
              </Link>
              <div className="px-4 pb-3 pl-16 sm:hidden"><VipBadge status={c.sub_status} endsAt={c.ends_at} /></div>
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} hrefFor={hrefFor} />
    </Card>
  );
}

export function qs(base: string, params: Record<string, string | number | undefined | null>) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") search.set(k, String(v));
  const s = search.toString();
  return s ? `${base}?${s}` : base;
}
