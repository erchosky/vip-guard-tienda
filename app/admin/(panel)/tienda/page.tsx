import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Plus, Sparkles } from "lucide-react";
import { PageHeader, Stat, EmptyState } from "@/components/ui/misc";
import { Card, CardHeader } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, customerName, METHOD_LABEL } from "@/components/admin/bits";
import { db } from "@/modules/core/db";
import { euros } from "@/modules/core/money";
import { formatShort } from "@/modules/core/dates";

export const metadata: Metadata = { title: "Tienda" };
export const dynamic = "force-dynamic";

export default async function ShopHome() {
  const [{ data: overview }, interests, sales, reserved] = await Promise.all([
    db().rpc("admin_overview"),
    db().from("shop_interests").select("id, product_id, product_title, price_shown_cents, was_vip, last_clicked_at, customers(id, first_name, last_name, username, telegram_id)").eq("status", "new").order("last_clicked_at", { ascending: false }).limit(6),
    db().from("shop_sales").select("id, product_title, amount_cents, method, sold_at, customer_id, buyer_label").is("voided_at", null).order("sold_at", { ascending: false }).limit(6),
    db().from("shop_products").select("id, title, reserved_at, shop_product_images(public_url, is_primary)").eq("status", "reserved").order("reserved_at").limit(6),
  ]);
  const o = (overview ?? {}) as Record<string, number>;
  return (
    <>
      <PageHeader title="Tienda" description="Tu escaparate en Telegram." actions={<LinkButton href="/admin/tienda/productos/nuevo" icon={<Plus className="h-4 w-4" />}>Nuevo producto</LinkButton>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Intereses nuevos" value={o.openInterests ?? 0} tone={o.openInterests ? "accent" : undefined} href="/admin/tienda/intereses" />
        <Stat label="Ventas del mes" value={euros(o.shopRevenueMonthCents)} hint={`${o.salesMonth ?? 0} ventas`} href="/admin/tienda/ventas" />
        <Stat label="Productos disponibles" value={o.productsAvailable ?? 0} href="/admin/tienda/productos?estado=available" />
        <Stat label="En oferta ahora" value={o.productsOnOffer ?? 0} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Intereses nuevos" actions={<Link className="link text-sm" href="/admin/tienda/intereses">Ver todos</Link>} />
          {interests.data?.length ? (
            <ul className="divide-y divide-line">
              {interests.data.map((i) => {
                const c = i.customers as unknown as { id: string; first_name: string | null; last_name: string | null; username: string | null; telegram_id: number };
                return (
                  <li key={i.id as string}>
                    <Link href="/admin/tienda/intereses" className="flex items-center gap-3 px-4 py-3 hover:bg-subtle sm:px-5">
                      <Avatar name={customerName(c)} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{customerName(c)} → {i.product_title as string}</span>
                        <span className="block text-xs text-muted">{formatShort(i.last_clicked_at as string)}{i.was_vip ? " · 👑 VIP" : ""}</span>
                      </span>
                      {i.price_shown_cents !== null ? <span className="text-sm tabular-nums">{euros(i.price_shown_cents as number)}</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : <EmptyState icon={<Sparkles className="h-5 w-5" />} title="Nada nuevo" description="Cuando alguien pulse «Me interesa» aparecerá aquí y te llegará un aviso." />}
        </Card>
        <Card>
          <CardHeader title="Reservados" description="Pendientes de cerrar" />
          {reserved.data?.length ? (
            <ul className="divide-y divide-line">
              {reserved.data.map((p) => {
                const img = ((p.shop_product_images ?? []) as Array<{ public_url: string; is_primary: boolean }>).sort((a, b) => Number(b.is_primary) - Number(a.is_primary))[0];
                return (
                  <li key={p.id as string}>
                    <Link href={`/admin/tienda/productos/${p.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-subtle sm:px-5">
                      <span className="relative h-10 w-10 overflow-hidden rounded-lg bg-subtle">{img ? <Image src={img.public_url} alt="" fill sizes="40px" className="object-cover" unoptimized /> : null}</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.title as string}</span>
                      {p.reserved_at ? <Badge tone="warning">desde {formatShort(p.reserved_at as string)}</Badge> : <Badge tone="warning">Reservado</Badge>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : <EmptyState title="Nada reservado" />}
        </Card>
      </div>
      <Card className="mt-6">
        <CardHeader title="Últimas ventas" actions={<Link className="link text-sm" href="/admin/tienda/ventas">Registrar venta</Link>} />
        {sales.data?.length ? (
          <ul className="divide-y divide-line">
            {sales.data.map((s) => (
              <li key={s.id as string} className="flex items-center gap-3 px-4 py-3 text-sm sm:px-5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{s.product_title as string}</span>
                  <span className="block text-xs text-muted">{formatShort(s.sold_at as string)} · {METHOD_LABEL[s.method as string]}{s.customer_id ? <> · <Link className="link" href={`/admin/clientes/${s.customer_id}`}>cliente</Link></> : s.buyer_label ? ` · ${s.buyer_label}` : ""}</span>
                </span>
                <span className="font-semibold tabular-nums">{euros(s.amount_cents as number)}</span>
              </li>
            ))}
          </ul>
        ) : <EmptyState title="Aún no hay ventas" />}
      </Card>
    </>
  );
}
