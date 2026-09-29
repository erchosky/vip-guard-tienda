import type { Metadata } from "next";
import { PageHeader, FilterChips, SearchBox } from "@/components/ui/misc";
import { CustomerList, qs } from "@/components/admin/customer-list";
import { listCustomers, type CustomerFilter, type CustomerSort } from "@/modules/customers/repo";
import { LinkButton } from "@/components/ui/button";
import { Download } from "lucide-react";

export const metadata: Metadata = { title: "Clientes" };
export const dynamic = "force-dynamic";

const FILTERS: Array<{ key: CustomerFilter; label: string }> = [
  { key: "all", label: "Todos" },
  { key: "active", label: "VIP activos" },
  { key: "buyers", label: "Compradores" },
  { key: "no_vip", label: "Nunca VIP" },
  { key: "problems", label: "Con problemas" },
];
const SORTS: Array<{ key: CustomerSort; label: string }> = [
  { key: "recent", label: "Recientes" },
  { key: "spent", label: "Más gasto" },
  { key: "purchases", label: "Más compras" },
];

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const filter = (FILTERS.find((x) => x.key === sp.f)?.key ?? "all") as CustomerFilter;
  const sort = (SORTS.find((x) => x.key === sp.o)?.key ?? "recent") as CustomerSort;
  const page = Number(sp.p) || 1;
  const { rows, total, pageSize } = await listCustomers({ search: sp.q, filter, sort, page });
  return (
    <>
      <PageHeader
        title="Clientes"
        description="Todas las personas que han abierto el bot o la tienda, con lo que han gastado en VIP y en la tienda."
        actions={<LinkButton download href="/api/admin/export/clientes" variant="secondary" icon={<Download className="h-4 w-4" />}>Excel</LinkButton>}
      />
      <div className="mb-4 flex flex-col gap-3">
        <SearchBox defaultValue={sp.q} placeholder="Nombre, @usuario, ID o #etiqueta…" hidden={{ f: filter, o: sort }} />
        <FilterChips active={filter} items={FILTERS.map((x) => ({ key: x.key, label: x.label, href: qs("/admin/clientes", { f: x.key, o: sort, q: sp.q }) }))} />
        <div className="flex items-center gap-2 text-[13px] text-muted">
          Ordenar:
          {SORTS.map((s) => (
            <a key={s.key} href={qs("/admin/clientes", { f: filter, o: s.key, q: sp.q })} className={s.key === sort ? "font-semibold text-fg" : "hover:text-fg"}>{s.label}</a>
          ))}
        </div>
      </div>
      <CustomerList rows={rows} total={total} page={page} pageSize={pageSize} hrefFor={(p) => qs("/admin/clientes", { f: filter, o: sort, q: sp.q, p })} emptyTitle="No hay clientes con ese filtro" />
    </>
  );
}
