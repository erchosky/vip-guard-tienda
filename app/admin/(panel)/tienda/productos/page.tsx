import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Package, Plus } from "lucide-react";
import { PageHeader, FilterChips, SearchBox, EmptyState, Pagination } from "@/components/ui/misc";
import { LinkButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { qs } from "@/components/admin/customer-list";
import { ProductQuickStatus } from "@/components/admin/product-quick-status";
import { eurosShort } from "@/modules/core/money";
import { listProducts } from "@/modules/shop/products";
import { isOfferActive } from "@/modules/shop/pricing";
import { PRODUCT_STATUS_LABELS, type ProductStatus } from "@/modules/shop/types";
import { productStatusAction } from "../actions";

export const metadata: Metadata = { title: "Productos" };
export const dynamic = "force-dynamic";

const FILTERS: Array<{ key: string; label: string }> = [
  { key: "active", label: "Todos" },
  { key: "available", label: "Disponibles" },
  { key: "reserved", label: "Reservados" },
  { key: "sold", label: "Vendidos" },
  { key: "draft", label: "Borradores" },
  { key: "hidden", label: "Ocultos" },
  { key: "archived", label: "Archivados" },
];
const TONE: Record<ProductStatus, "success" | "warning" | "neutral" | "danger" | "accent"> = { available: "success", reserved: "warning", sold: "accent", draft: "neutral", hidden: "neutral", archived: "danger" };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const status = FILTERS.find((x) => x.key === sp.estado)?.key ?? "active";
  const page = Number(sp.p) || 1;
  const { rows, total, pageSize } = await listProducts({ search: sp.q, status: status as ProductStatus | "active", page });
  return (
    <>
      <PageHeader title="Productos" actions={<LinkButton href="/admin/tienda/productos/nuevo" icon={<Plus className="h-4 w-4" />}>Nuevo producto</LinkButton>} />
      <div className="mb-4 flex flex-col gap-3">
        <SearchBox defaultValue={sp.q} placeholder="Buscar producto…" hidden={{ estado: status === "active" ? undefined : status }} />
        <FilterChips active={status} items={FILTERS.map((x) => ({ key: x.key, label: x.label, href: qs("/admin/tienda/productos", { estado: x.key === "active" ? undefined : x.key, q: sp.q }) }))} />
      </div>
      {rows.length === 0 ? (
        <div className="card"><EmptyState icon={<Package className="h-5 w-5" />} title="No hay productos aquí" action={<LinkButton href="/admin/tienda/productos/nuevo">Crear el primero</LinkButton>} /></div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {rows.map((p) => {
            const offer = isOfferActive(p);
            return (
              <div key={p.id} className="card overflow-hidden">
                <Link href={`/admin/tienda/productos/${p.id}`} className="block">
                  <div className="relative aspect-square bg-subtle">
                    {p.primary_image ? <Image src={p.primary_image} alt="" fill sizes="(max-width: 640px) 50vw, 25vw" className="object-cover" unoptimized /> : <div className="grid h-full place-items-center text-muted"><Package className="h-8 w-8" /></div>}
                    <div className="absolute left-2 top-2 flex flex-wrap gap-1">
                      <Badge tone={TONE[p.status]} className="bg-surface/90 backdrop-blur">{PRODUCT_STATUS_LABELS[p.status]}</Badge>
                      {offer ? <Badge tone="danger" className="bg-surface/90">Oferta</Badge> : null}
                      {p.is_featured ? <Badge tone="accent" className="bg-surface/90">★</Badge> : null}
                    </div>
                    {p.open_interests ? <span className="absolute right-2 top-2 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-fg">{p.open_interests} interés{p.open_interests > 1 ? "es" : ""}</span> : null}
                  </div>
                  <div className="p-3 pb-2">
                    <p className="line-clamp-1 text-sm font-medium">{p.title}</p>
                    <p className="text-sm">
                      <span className="font-semibold">{eurosShort(offer ? p.offer_price_cents : p.price_cents)}</span>
                      {offer ? <span className="ml-1.5 text-xs text-muted line-through">{eurosShort(p.price_cents)}</span> : null}
                    </p>
                    <p className="truncate text-xs text-muted">{p.category_name ?? "Sin categoría"}</p>
                  </div>
                </Link>
                <div className="px-3 pb-3"><ProductQuickStatus action={productStatusAction} id={p.id} status={p.status} /></div>
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-4 card overflow-hidden empty:hidden"><Pagination page={page} pageSize={pageSize} total={total} hrefFor={(n) => qs("/admin/tienda/productos", { estado: status === "active" ? undefined : status, q: sp.q, p: n })} /></div>
    </>
  );
}
