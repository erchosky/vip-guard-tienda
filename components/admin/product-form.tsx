"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Save, Tag } from "lucide-react";
import { ActionForm, type FormAction } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, MoneyInput, Select, Switch, Textarea } from "@/components/ui/field";
import { cn } from "@/components/ui/cn";
import { ImageUploader, type UploadedImage } from "./image-uploader";
import { computePrice } from "@/modules/shop/pricing";

export type ProductFormValues = {
  id?: string;
  updated_at?: string;
  title: string;
  description: string;
  category_id: string;
  size: string;
  color: string;
  price: string;
  offer_price: string;
  offer_starts_at: string;
  offer_ends_at: string;
  vip_price: string;
  is_unique: boolean;
  fulfillment: "physical" | "digital";
  status: string;
  is_featured: boolean;
  sort_order: number;
  internal_notes: string;
  images: UploadedImage[];
};

const STATUS_OPTIONS = [
  { value: "draft", label: "Borrador", hint: "No se ve en la tienda" },
  { value: "available", label: "Disponible", hint: "Se ve y se puede pedir" },
  { value: "reserved", label: "Reservado", hint: "Se ve con la etiqueta RESERVADO" },
  { value: "sold", label: "Vendido", hint: "Se ve unos días con VENDIDO" },
  { value: "hidden", label: "Oculto", hint: "No se ve" },
  { value: "archived", label: "Archivado", hint: "Fuera de la tienda y de las listas" },
];

const toCents = (v: string) => {
  const n = Number(v.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && v.trim() !== "" ? Math.round(n * 100) : null;
};
const fmt = (cents: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);

export function ProductForm({ action, values, categories, vipDiscountPercent }: { action: FormAction; values: ProductFormValues; categories: Array<{ id: string; name: string }>; vipDiscountPercent: number }) {
  const [v, setV] = useState(values);
  const [onOffer, setOnOffer] = useState(Boolean(values.offer_price));
  const [images, setImages] = useState<UploadedImage[]>(values.images);
  const set = <K extends keyof ProductFormValues>(key: K) => (e: { target: { value: string } }) => setV((prev) => ({ ...prev, [key]: e.target.value }));

  const preview = useMemo(() => {
    const price = toCents(v.price) ?? 0;
    const fields = {
      price_cents: price,
      offer_price_cents: onOffer ? toCents(v.offer_price) : null,
      offer_starts_at: onOffer && v.offer_starts_at ? new Date(v.offer_starts_at).toISOString() : null,
      offer_ends_at: onOffer && v.offer_ends_at ? new Date(v.offer_ends_at).toISOString() : null,
      vip_price_cents: toCents(v.vip_price),
    };
    return { normal: computePrice(fields, { isVip: false, vipDiscountPercent }), vip: computePrice(fields, { isVip: true, vipDiscountPercent }) };
  }, [v.price, v.offer_price, v.offer_starts_at, v.offer_ends_at, v.vip_price, onOffer, vipDiscountPercent]);

  return (
    <ActionForm action={action} className="grid gap-6 lg:grid-cols-[1fr_320px]">
      {v.id ? <input type="hidden" name="id" value={v.id} /> : null}
      {values.updated_at ? <input type="hidden" name="updated_at" value={values.updated_at} /> : null}
      <input type="hidden" name="on_offer" value={onOffer ? "on" : ""} />

      <div className="space-y-6">
        <Card>
          <CardHeader title="Fotos" />
          <CardBody>
            <ImageUploader name="images" folder="products" initial={values.images} onChange={setImages} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Producto" />
          <CardBody className="space-y-4">
            <Field label="Título"><Input name="title" value={v.title} onChange={set("title")} required maxLength={120} placeholder="Tanga rosa de encaje" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Categoría">
                <Select name="category_id" value={v.category_id} onChange={set("category_id")}>
                  <option value="">Sin categoría</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label="Tipo">
                <Select name="fulfillment" value={v.fulfillment} onChange={set("fulfillment")}>
                  <option value="physical">📦 Físico (se envía)</option>
                  <option value="digital">📲 Digital (lo mandas por privado)</option>
                </Select>
              </Field>
              <Field label="Talla"><Input name="size" value={v.size} onChange={set("size")} maxLength={40} placeholder="S, M, 38…" /></Field>
              <Field label="Color"><Input name="color" value={v.color} onChange={set("color")} maxLength={40} placeholder="Rosa" /></Field>
            </div>
            <Field label="Descripción"><Textarea name="description" value={v.description} onChange={set("description")} maxLength={3000} placeholder="Cuántos días usado, cómo se envía…" /></Field>
            <Switch name="is_unique" defaultChecked={v.is_unique} label="Pieza única" description="Al registrar la venta pasa sola a VENDIDO. Desactívalo para packs digitales que se pueden vender muchas veces." />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Precio" />
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Precio"><MoneyInput name="price" value={v.price} onChange={set("price")} required /></Field>
              <Field label="Precio VIP (opcional)" hint={vipDiscountPercent ? `Si lo dejas vacío, el VIP paga un ${vipDiscountPercent}% menos (Ajustes).` : "Si lo dejas vacío, el VIP paga lo mismo."}>
                <MoneyInput name="vip_price" value={v.vip_price} onChange={set("vip_price")} />
              </Field>
            </div>
            <div className="rounded-xl border border-line p-3">
              <label className="flex cursor-pointer items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-sm font-medium"><Tag className="h-4 w-4 text-accent" />Poner en oferta</span>
                <input type="checkbox" checked={onOffer} onChange={(e) => setOnOffer(e.target.checked)} className="h-5 w-5 accent-[rgb(var(--c-accent))]" />
              </label>
              {onOffer ? (
                <div className="mt-3 grid gap-4 sm:grid-cols-3">
                  <Field label="Precio de oferta"><MoneyInput name="offer_price" value={v.offer_price} onChange={set("offer_price")} required /></Field>
                  <Field label="Empieza" hint="Vacío = ya"><Input type="datetime-local" name="offer_starts_at" value={v.offer_starts_at} onChange={set("offer_starts_at")} /></Field>
                  <Field label="Termina" hint="Vacío = sin fin"><Input type="datetime-local" name="offer_ends_at" value={v.offer_ends_at} onChange={set("offer_ends_at")} /></Field>
                </div>
              ) : null}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Estado y orden" />
          <CardBody className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-3">
              {STATUS_OPTIONS.map((o) => (
                <label key={o.value} className={cn("cursor-pointer rounded-xl border px-3 py-2.5 transition", v.status === o.value ? "border-accent bg-accent-soft" : "border-line hover:bg-subtle")}>
                  <input type="radio" name="status" value={o.value} checked={v.status === o.value} onChange={set("status")} className="sr-only" />
                  <span className="block text-sm font-semibold">{o.label}</span>
                  <span className="block text-xs text-muted">{o.hint}</span>
                </label>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Switch name="is_featured" defaultChecked={v.is_featured} label="Destacado" description="Sale el primero en la tienda." />
              <Field label="Orden" hint="Menor número = antes"><Input name="sort_order" type="number" defaultValue={v.sort_order} /></Field>
            </div>
            <Field label="Notas internas" hint="Solo las veis vosotros."><Textarea name="internal_notes" defaultValue={v.internal_notes} className="min-h-[64px]" /></Field>
          </CardBody>
        </Card>
      </div>

      <aside className="space-y-3 lg:sticky lg:top-6 lg:h-fit">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">Así se verá en la tienda</p>
        <PhonePreview title={v.title} image={images[0]?.url} size={v.size} color={v.color} status={v.status} digital={v.fulfillment === "digital"} normal={preview.normal} vip={preview.vip} />
      </aside>

      <div className="sticky bottom-0 z-20 -mx-4 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:col-span-2 lg:mx-0 lg:rounded-2xl lg:border">
        <div className="flex items-center justify-end gap-3">
          <Button size="lg" icon={<Save className="h-4 w-4" />} pendingText="Guardando…">{v.id ? "Guardar cambios" : "Crear producto"}</Button>
        </div>
      </div>
    </ActionForm>
  );
}

function PhonePreview({ title, image, size, color, status, digital, normal, vip }: {
  title: string; image?: string; size: string; color: string; status: string; digital: boolean;
  normal: ReturnType<typeof computePrice>; vip: ReturnType<typeof computePrice>;
}) {
  const badge = status === "sold" ? "VENDIDO" : status === "reserved" ? "RESERVADO" : normal.offerActive ? "OFERTA" : null;
  return (
    <div className="overflow-hidden rounded-[22px] border border-line bg-surface shadow-pop">
      <div className="relative aspect-[4/5] bg-subtle">
        {image ? <Image src={image} alt="" fill sizes="320px" className={cn("object-cover", status === "sold" && "grayscale")} unoptimized /> : <div className="grid h-full place-items-center text-sm text-muted">Sin foto</div>}
        {badge ? <span className={cn("absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-bold text-white", badge === "OFERTA" ? "bg-rose-600" : "bg-black/70")}>{badge}</span> : null}
      </div>
      <div className="space-y-1 p-3">
        <p className="line-clamp-2 text-sm font-semibold">{title || "Título del producto"}</p>
        <p className="text-xs text-muted">{[size && `Talla ${size}`, color, digital ? "Digital" : null].filter(Boolean).join(" · ") || " "}</p>
        <div className="flex items-baseline gap-2 pt-1">
          <span className="text-lg font-bold">{fmt(normal.finalCents)}</span>
          {normal.compareAtCents ? <span className="text-sm text-muted line-through">{fmt(normal.compareAtCents)}</span> : null}
        </div>
        {normal.vipAdvantage ? <p className="text-xs font-medium text-amber-600">👑 VIP: {fmt(vip.finalCents)}</p> : null}
        {status === "draft" || status === "hidden" ? <p className="pt-1 text-xs text-warning">No visible en la tienda ({status === "draft" ? "borrador" : "oculto"})</p> : null}
      </div>
    </div>
  );
}
