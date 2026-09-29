"use client";

import { ActionForm, type FormAction } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Field, Input, MoneyInput, Select, Switch, Textarea } from "@/components/ui/field";

export type PlanValues = { id?: string; name: string; description: string | null; duration_days: number; price_first: string; price_renewal: string; status: string; is_featured: boolean; sort_order: number };

export function PlanForm({ action, plan, submitLabel }: { action: FormAction; plan?: PlanValues; submitLabel: string }) {
  return (
    <ActionForm action={action} className="space-y-4" resetOnSuccess={!plan}>
      {plan?.id ? <input type="hidden" name="id" value={plan.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" hint="Ej: 1 mes, 3 meses, Semana de prueba"><Input name="name" defaultValue={plan?.name} required maxLength={80} /></Field>
        <Field label="Duración (días)"><Input name="duration_days" type="number" min={1} max={3650} defaultValue={plan?.duration_days ?? 30} required /></Field>
        <Field label="Precio de alta" hint="Lo que paga la primera vez"><MoneyInput name="price_first" defaultValue={plan?.price_first} required /></Field>
        <Field label="Precio de renovación" hint="Si lo dejas vacío, igual que el de alta"><MoneyInput name="price_renewal" defaultValue={plan?.price_renewal} /></Field>
      </div>
      <Field label="Descripción (opcional)"><Textarea name="description" defaultValue={plan?.description ?? ""} maxLength={500} className="min-h-[64px]" /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Visibilidad">
          <Select name="status" defaultValue={plan?.status ?? "active"}>
            <option value="active">Visible para los clientes</option>
            <option value="hidden">Oculto (solo lo usas tú desde el panel)</option>
            <option value="archived">Archivado</option>
          </Select>
        </Field>
        <Field label="Orden" hint="Menor número = sale antes"><Input name="sort_order" type="number" defaultValue={plan?.sort_order ?? 100} /></Field>
      </div>
      <Switch name="is_featured" defaultChecked={plan?.is_featured} label="Destacar este plan" description="Se marca como recomendado en la tienda." />
      <Button>{submitLabel}</Button>
    </ActionForm>
  );
}
