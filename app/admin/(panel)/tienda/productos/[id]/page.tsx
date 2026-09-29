import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Copy } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProductForm } from "@/components/admin/product-form";
import { SaleForm } from "@/components/admin/sale-form";
import { ActionButton } from "@/components/admin/action-button";
import { VoidForm } from "@/components/admin/customer-forms";
import { METHOD_LABEL } from "@/components/admin/bits";
import { db } from "@/modules/core/db";
import { AppError } from "@/modules/core/errors";
import { centsToInput, euros } from "@/modules/core/money";
import { dateToMadridLocal, formatShort } from "@/modules/core/dates";
import { getProduct } from "@/modules/shop/products";
import { listCategories } from "@/modules/shop/categories";
import { getSettings } from "@/modules/settings/repo";
import { INTEREST_STATUS_LABELS, type InterestStatus } from "@/modules/shop/interests";
import { duplicateProductAction, productStatusAction, registerSaleAction, saveProductAction, voidSaleAction } from "../../actions";

export const metadata: Metadata = { title: "Editar producto" };
export const dynamic = "force-dynamic";

export default async function EditProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await getProduct(id).catch((error) => {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  });
  const { product, images } = data;
  const [categories, shop, sales, interests] = await Promise.all([
    listCategories(true),
    getSettings("shop"),
    db().from("shop_sales").select("*, customers(id, first_name, username)").eq("product_id", id).order("sold_at", { ascending: false }).limit(20),
    db().from("shop_interests").select("*, customers(id, first_name, last_name, username, telegram_id)").eq("product_id", id).order("last_clicked_at", { ascending: false }).limit(30),
  ]);
  const canSell = product.status === "available" || product.status === "reserved" || !product.is_unique;

  return (
    <>
      <PageHeader
        back={{ href: "/admin/tienda/productos", label: "Productos" }}
        title={product.title}
        description={sp.nuevo ? "✅ Producto creado." : sp.guardado ? "✅ Cambios guardados." : sp.copia ? "Copia creada como borrador: cambia lo que haga falta y añade fotos." : undefined}
        actions={
          <>
            <ActionButton action={duplicateProductAction} fields={{ id }} variant="secondary" icon={<Copy className="h-4 w-4" />}>Duplicar</ActionButton>
            {product.status === "archived"
              ? <ActionButton action={productStatusAction} fields={{ id, status: "hidden" }} variant="secondary">Restaurar (oculto)</ActionButton>
              : <ActionButton action={productStatusAction} fields={{ id, status: "archived" }} variant="danger" confirm="Se quitará de la tienda y de las listas. El historial se conserva. ¿Archivar?">Archivar</ActionButton>}
          </>
        }
      />
      <ProductForm
        key={product.updated_at}
        action={saveProductAction}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        vipDiscountPercent={shop.vipDiscountPercent}
        values={{
          id: product.id,
          updated_at: product.updated_at,
          title: product.title,
          description: product.description ?? "",
          category_id: product.category_id ?? "",
          size: product.size ?? "",
          color: product.color ?? "",
          price: centsToInput(product.price_cents),
          offer_price: centsToInput(product.offer_price_cents),
          offer_starts_at: dateToMadridLocal(product.offer_starts_at),
          offer_ends_at: dateToMadridLocal(product.offer_ends_at),
          vip_price: centsToInput(product.vip_price_cents),
          is_unique: product.is_unique,
          fulfillment: product.fulfillment,
          status: product.status,
          is_featured: product.is_featured,
          sort_order: product.sort_order,
          internal_notes: product.internal_notes ?? "",
          images: images.map((i) => ({ path: i.storage_path, url: i.public_url, width: i.width ?? 0, height: i.height ?? 0 })),
        }}
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Registrar venta de este producto" />
          <CardBody>
            {canSell ? <SaleForm action={registerSaleAction} products={[{ id: product.id, title: product.title, priceCents: product.offer_price_cents ?? product.price_cents, status: product.status }]} /> : <p className="text-sm text-muted">Está {product.status === "sold" ? "vendido" : "fuera de la tienda"}. {product.status === "sold" ? "Si fue un error, anula la venta abajo." : ""}</p>}
          </CardBody>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Ventas" />
            {sales.data?.length ? (
              <ul className="divide-y divide-line">
                {sales.data.map((s) => {
                  const c = s.customers as unknown as { id: string; first_name: string | null; username: string | null } | null;
                  return (
                    <li key={s.id as string} className={`flex items-center gap-3 px-4 py-3 text-sm sm:px-5 ${s.voided_at ? "opacity-50" : ""}`}>
                      <span className="min-w-0 flex-1">
                        {c ? <Link className="font-medium hover:underline" href={`/admin/clientes/${c.id}`}>{c.first_name ?? `@${c.username}`}</Link> : <span className="font-medium">{s.buyer_label as string}</span>}
                        <span className="block text-xs text-muted">{formatShort(s.sold_at as string)} · {METHOD_LABEL[s.method as string]}{s.voided_at ? " · anulada" : ""}</span>
                      </span>
                      <span className="font-semibold tabular-nums">{euros(s.amount_cents as number)}</span>
                      {!s.voided_at ? <VoidForm action={voidSaleAction} idName="saleId" id={s.id as string} /> : null}
                    </li>
                  );
                })}
              </ul>
            ) : <EmptyState title="Sin ventas" />}
          </Card>
          <Card>
            <CardHeader title="Interesados" />
            {interests.data?.length ? (
              <ul className="divide-y divide-line">
                {interests.data.map((i) => {
                  const c = i.customers as unknown as { id: string; first_name: string | null; last_name: string | null; username: string | null };
                  return (
                    <li key={i.id as string} className="flex items-center gap-3 px-4 py-3 text-sm sm:px-5">
                      <Link className="min-w-0 flex-1 truncate font-medium hover:underline" href={`/admin/clientes/${c.id}`}>{[c.first_name, c.last_name].filter(Boolean).join(" ") || `@${c.username}`}</Link>
                      <span className="text-xs text-muted">{formatShort(i.last_clicked_at as string)}</span>
                      <Badge tone={i.status === "new" ? "accent" : "neutral"}>{INTEREST_STATUS_LABELS[i.status as InterestStatus]}</Badge>
                    </li>
                  );
                })}
              </ul>
            ) : <EmptyState title="Nadie todavía" />}
          </Card>
        </div>
      </div>
    </>
  );
}
