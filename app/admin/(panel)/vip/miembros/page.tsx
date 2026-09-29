import type { Metadata } from "next";
import { PageHeader, FilterChips, SearchBox } from "@/components/ui/misc";
import { CustomerList, qs } from "@/components/admin/customer-list";
import { listCustomers, type CustomerFilter } from "@/modules/customers/repo";

export const metadata: Metadata = { title: "Miembros VIP" };
export const dynamic = "force-dynamic";

const FILTERS: Array<{ key: CustomerFilter; label: string }> = [
  { key: "active", label: "Activos" },
  { key: "expiring", label: "Caducan en 3 días" },
  { key: "expired", label: "Caducados" },
  { key: "members", label: "Todos los que han sido VIP" },
  { key: "all", label: "Todos los clientes" },
];

export default async function MembersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const filter = (FILTERS.find((x) => x.key === sp.f)?.key ?? (sp.q ? "all" : "active")) as CustomerFilter;
  const page = Number(sp.p) || 1;
  const sort = filter === "active" || filter === "expiring" ? "ends" : "recent";
  const { rows, total, pageSize } = await listCustomers({ search: sp.q, filter, sort, page });
  return (
    <>
      <PageHeader
        title="Miembros"
        description="Para dar de alta o renovar, busca a la persona y abre su ficha. Tiene que haber abierto el bot al menos una vez."
      />
      <div className="mb-4 flex flex-col gap-3">
        <SearchBox defaultValue={sp.q} placeholder="Buscar por nombre, @usuario o ID…" hidden={{ f: filter }} />
        <FilterChips active={filter} items={FILTERS.map((x) => ({ key: x.key, label: x.label, href: qs("/admin/vip/miembros", { f: x.key, q: sp.q }) }))} />
      </div>
      <CustomerList
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        hrefFor={(p) => qs("/admin/vip/miembros", { f: filter, q: sp.q, p })}
        emptyTitle={sp.q ? "No hay nadie con esa búsqueda" : "Nadie por aquí todavía"}
        emptyDescription={sp.q ? "Si no aparece, pídele que abra el bot y pulse Iniciar." : undefined}
      />
    </>
  );
}
