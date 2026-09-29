"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { ActionForm, type FormAction } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";

export function BroadcastForm({ action, counts }: { action: FormAction; counts: Record<string, number> }) {
  const [segment, setSegment] = useState("vip");
  const labels: Record<string, string> = { all: "Todos los que han abierto el bot", vip: "Miembros VIP activos", ex_vip: "Ex VIP (caducados)", buyers: "Compradores de la tienda", no_vip: "Nunca han sido VIP" };
  return (
    <ActionForm action={action} className="space-y-4" resetOnSuccess confirm={`¿Enviar a ${counts[segment] ?? 0} personas? No se puede deshacer.`}>
      <Field label="¿A quién?">
        <Select name="segment" value={segment} onChange={(e) => setSegment(e.target.value)}>
          {Object.entries(labels).map(([k, label]) => <option key={k} value={k}>{label} ({counts[k] ?? 0})</option>)}
        </Select>
      </Field>
      <Field label="Mensaje" hint="Texto normal con emojis. Úsalo con moderación: Telegram penaliza a los bots que envían spam.">
        <Textarea name="body" required maxLength={4000} rows={6} />
      </Field>
      <Button icon={<Send className="h-4 w-4" />} pendingText="Preparando…">Enviar</Button>
    </ActionForm>
  );
}
