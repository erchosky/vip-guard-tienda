"use client";

import { ActionForm, type FormAction } from "@/components/ui/action-form";

const OPTIONS = [
  ["draft", "Borrador"], ["available", "Disponible"], ["reserved", "Reservado"], ["sold", "Vendido"], ["hidden", "Oculto"], ["archived", "Archivado"],
] as const;

/** Cambiar el estado de un producto desde la lista, sin abrirlo. */
export function ProductQuickStatus({ action, id, status }: { action: FormAction; id: string; status: string }) {
  return (
    <ActionForm action={action}>
      <input type="hidden" name="id" value={id} />
      <select
        name="status"
        defaultValue={status}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="h-8 w-full rounded-lg border border-line bg-surface px-2 text-xs"
        aria-label="Estado"
      >
        {OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </ActionForm>
  );
}
