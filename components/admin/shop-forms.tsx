"use client";

import { ActionForm, type FormAction } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { ImageUploader, type UploadedImage } from "./image-uploader";

export function CategoryForm({ action, category }: { action: FormAction; category?: { id: string; name: string; description: string | null; status: string; sort_order: number; image: UploadedImage | null } }) {
  return (
    <ActionForm action={action} className="space-y-4" resetOnSuccess={!category}>
      {category ? <input type="hidden" name="id" value={category.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
        <Field label="Nombre"><Input name="name" defaultValue={category?.name} required maxLength={60} placeholder="Tangas" /></Field>
        <Field label="Orden"><Input name="sort_order" type="number" defaultValue={category?.sort_order ?? 100} /></Field>
      </div>
      <Field label="Descripción (opcional)"><Textarea name="description" defaultValue={category?.description ?? ""} maxLength={300} className="min-h-[64px]" /></Field>
      <Field label="Visibilidad">
        <Select name="status" defaultValue={category?.status ?? "visible"}>
          <option value="visible">Visible en la tienda</option>
          <option value="hidden">Oculta (y sus productos también)</option>
          <option value="archived">Archivada</option>
        </Select>
      </Field>
      <ImageUploader key={category?.image?.path ?? "none"} name="image" folder="categories" multiple={false} initial={category?.image ? [category.image] : []} label="Imagen (opcional)" />
      <Button>{category ? "Guardar" : "Crear categoría"}</Button>
    </ActionForm>
  );
}

export function BrandForm({ action, brand }: { action: FormAction; brand: { name: string; tagline: string; contactUsername: string; logo: UploadedImage | null } }) {
  return (
    <ActionForm action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" hint="Se usa como {creadora} en todos los textos"><Input name="name" defaultValue={brand.name} required maxLength={40} /></Field>
        <Field label="Tu @usuario de Telegram" hint="Aquí llegan los mensajes «Me interesa» y de planes"><Input name="contactUsername" defaultValue={brand.contactUsername ? `@${brand.contactUsername}` : ""} placeholder="@tu_usuario" maxLength={60} /></Field>
      </div>
      <Field label="Frase de la tienda (opcional)"><Input name="tagline" defaultValue={brand.tagline} maxLength={120} placeholder="Mi rincón privado 💋" /></Field>
      <ImageUploader name="logo" folder="brand" multiple={false} initial={brand.logo ? [brand.logo] : []} label="Logo o foto de perfil (opcional)" />
      <Button>Guardar</Button>
    </ActionForm>
  );
}

export function ShopSettingsForm({ action, vipDiscountPercent, soldVisibleDays }: { action: FormAction; vipDiscountPercent: number; soldVisibleDays: number }) {
  return (
    <ActionForm action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Descuento VIP general (%)" hint="Se aplica a todo lo que no tenga un precio VIP propio. 0 = sin descuento.">
          <Input name="vipDiscountPercent" type="number" min={0} max={90} defaultValue={vipDiscountPercent} />
        </Field>
        <Field label="Días con el sello VENDIDO" hint="Tras venderse, se ve unos días como vendido (da sensación de demanda) y luego desaparece. 0 = desaparece al momento.">
          <Input name="soldVisibleDays" type="number" min={0} max={60} defaultValue={soldVisibleDays} />
        </Field>
      </div>
      <Button>Guardar</Button>
    </ActionForm>
  );
}

export function InterestActions({ action, id, status, note }: { action: FormAction; id: string; status: string; note: string | null }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {status !== "contacted" ? (
        <ActionForm action={action}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="contacted" /><Button size="sm" variant="secondary">Contactado</Button></ActionForm>
      ) : null}
      {status !== "discarded" ? (
        <ActionForm action={action}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="discarded" /><Button size="sm" variant="ghost">Descartar</Button></ActionForm>
      ) : (
        <ActionForm action={action}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="new" /><Button size="sm" variant="ghost">Reabrir</Button></ActionForm>
      )}
      <details className="relative">
        <summary className="cursor-pointer list-none text-xs text-muted hover:text-fg">{note ? "📝 Nota" : "Añadir nota"}</summary>
        <ActionForm action={action} className="absolute right-0 z-20 mt-1 w-64 rounded-xl border border-line bg-surface p-2 shadow-pop">
          <input type="hidden" name="id" value={id} />
          <Textarea name="admin_note" defaultValue={note ?? ""} maxLength={1000} className="min-h-[72px]" />
          <Button size="sm" className="mt-2">Guardar nota</Button>
        </ActionForm>
      </details>
    </div>
  );
}
