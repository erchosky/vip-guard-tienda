"use client";

import { useMemo, useState } from "react";
import { Gift, Minus, ShieldBan, UserX, Wallet } from "lucide-react";
import { ActionForm, type FormAction } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Field, Input, MoneyInput, Textarea } from "@/components/ui/field";
import { cn } from "@/components/ui/cn";

type PlanOption = { id: string; name: string; durationLabel: string; firstCents: number; renewalCents: number; status: string };

const toInput = (cents: number) => (cents / 100).toFixed(2).replace(".", ",").replace(/,00$/, "");
const fmt = (cents: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);

const METHODS = [
  { value: "bizum", label: "Bizum" },
  { value: "paypal", label: "PayPal" },
  { value: "transferencia", label: "Transferencia" },
  { value: "efectivo", label: "Efectivo" },
  { value: "otro", label: "Otro" },
];

/** Registrar pago: plan → importe sugerido (alta o renovación) → método. */
export function PaymentForm({ action, customerId, plans, hasPaidBefore, isActive }: { action: FormAction; customerId: string; plans: PlanOption[]; hasPaidBefore: boolean; isActive: boolean }) {
  const [planId, setPlanId] = useState(plans.find((p) => p.status === "active")?.id ?? plans[0]?.id ?? "");
  const [method, setMethod] = useState("bizum");
  const plan = plans.find((p) => p.id === planId);
  const suggested = plan ? (hasPaidBefore ? plan.renewalCents : plan.firstCents) : 0;
  const [amount, setAmount] = useState(toInput(suggested));

  if (plans.length === 0) {
    return <p className="text-sm text-muted">Primero crea un plan en «Planes y precios».</p>;
  }
  return (
    <ActionForm action={action} className="space-y-4">
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="method" value={method} />
      <Field label="Plan">
        <div className="grid gap-2 sm:grid-cols-2">
          {plans.map((p) => {
            const price = hasPaidBefore ? p.renewalCents : p.firstCents;
            return (
              <button
                type="button"
                key={p.id}
                onClick={() => { setPlanId(p.id); setAmount(toInput(price)); }}
                className={cn("rounded-xl border px-3 py-2.5 text-left transition", planId === p.id ? "border-accent bg-accent-soft" : "border-line hover:bg-subtle")}
              >
                <span className="block text-sm font-semibold">{p.name}{p.status !== "active" ? " (oculto)" : ""}</span>
                <span className="block text-xs text-muted">{p.durationLabel} · {fmt(price)} {hasPaidBefore ? "renovación" : "alta"}</span>
              </button>
            );
          })}
        </div>
        <input type="hidden" name="planId" value={planId} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Importe cobrado" hint={isActive ? "Los días se suman a los que ya tiene." : "Los días cuentan desde ahora."}>
          <MoneyInput name="amount" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </Field>
        <Field label="Método">
          <div className="flex flex-wrap gap-1.5">
            {METHODS.map((m) => (
              <button type="button" key={m.value} onClick={() => setMethod(m.value)} className={cn("h-10 rounded-lg border px-3 text-sm", method === m.value ? "border-accent bg-accent text-accent-fg" : "border-line hover:bg-subtle")}>{m.label}</button>
            ))}
          </div>
        </Field>
      </div>
      <Field label="Nota (opcional)"><Input name="note" placeholder="Ej: pagó el viernes por la noche" maxLength={500} /></Field>
      <Button size="lg" className="w-full sm:w-auto" icon={<Wallet className="h-4 w-4" />} pendingText="Registrando…">Registrar pago y dar acceso</Button>
    </ActionForm>
  );
}

export function DaysForm({ action, customerId }: { action: FormAction; customerId: string }) {
  const [mode, setMode] = useState<"add" | "remove">("add");
  return (
    <ActionForm action={action} className="space-y-3">
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="mode" value={mode} />
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-subtle p-1">
        <button type="button" onClick={() => setMode("add")} className={cn("flex h-8 items-center justify-center gap-1.5 rounded-lg text-[13px] font-medium", mode === "add" ? "bg-surface text-accent shadow-card" : "text-muted")}><Gift className="h-4 w-4" />Regalar días</button>
        <button type="button" onClick={() => setMode("remove")} className={cn("flex h-8 items-center justify-center gap-1.5 rounded-lg text-[13px] font-medium", mode === "remove" ? "bg-surface text-danger shadow-card" : "text-muted")}><Minus className="h-4 w-4" />Quitar días</button>
      </div>
      <div className="flex flex-wrap gap-2">
        {[1, 3, 7, 15, 30].map((d) => (
          <Button key={d} type="submit" name="days" value={String(d)} variant="secondary" size="sm">{mode === "add" ? "+" : "−"}{d} {d === 1 ? "día" : "días"}</Button>
        ))}
      </div>
      <div className="flex gap-2">
        <Input name="days" type="number" min={1} max={3650} placeholder="Otro nº de días" className="max-w-[160px]" />
        <Button variant="secondary">Aplicar</Button>
      </div>
      {mode === "add" ? (
        <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" name="notify" defaultChecked className="accent-[rgb(var(--c-accent))]" /> Avisarle por el bot del regalo</label>
      ) : null}
    </ActionForm>
  );
}

export function EndDateForm({ action, customerId, current }: { action: FormAction; customerId: string; current: string }) {
  return (
    <ActionForm action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="customerId" value={customerId} />
      <Field label="Termina el (hora de Madrid)" className="min-w-[220px] flex-1"><Input type="datetime-local" name="endsAt" defaultValue={current} required /></Field>
      <Button variant="secondary">Fijar fecha</Button>
    </ActionForm>
  );
}

export function RevokeForm({ action, customerId }: { action: FormAction; customerId: string }) {
  return (
    <ActionForm action={action} className="space-y-2">
      <input type="hidden" name="customerId" value={customerId} />
      <p className="text-sm text-muted">Le corta el VIP ahora mismo y le saca del canal. Podrá volver si le registras otro pago.</p>
      <div className="flex flex-wrap gap-2">
        <Input name="confirm" placeholder="Escribe ECHAR" className="max-w-[160px]" autoComplete="off" />
        <Input name="note" placeholder="Motivo (opcional)" className="min-w-[160px] flex-1" />
        <Button variant="danger" icon={<UserX className="h-4 w-4" />} pendingText="Echando…">Echar ahora</Button>
      </div>
    </ActionForm>
  );
}

export function BanForm({ action, customerId, banned }: { action: FormAction; customerId: string; banned: boolean }) {
  return (
    <ActionForm action={action} confirm={banned ? "¿Quitar el veto?" : "¿Vetar a esta persona? No podrá entrar al canal nunca, aunque consiga el enlace."}>
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="banned" value={banned ? "0" : "1"} />
      <Button variant={banned ? "secondary" : "danger"} icon={<ShieldBan className="h-4 w-4" />}>{banned ? "Quitar veto" : "Vetar"}</Button>
    </ActionForm>
  );
}

export function SimpleActionButton({ action, fields, label, variant = "secondary", confirm, size = "sm" }: { action: FormAction; fields: Record<string, string>; label: string; variant?: "secondary" | "danger" | "ghost" | "primary" | "soft"; confirm?: string; size?: "sm" | "md" }) {
  return (
    <ActionForm action={action} confirm={confirm}>
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <Button variant={variant} size={size}>{label}</Button>
    </ActionForm>
  );
}

export function VoidForm({ action, idName, id, label = "Anular" }: { action: FormAction; idName: string; id: string; label?: string }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="text-xs text-muted hover:text-danger">{label}</button>;
  return (
    <ActionForm action={action} className="flex items-center gap-1.5" confirm="¿Seguro? Quedará anulado en el historial.">
      <input type="hidden" name={idName} value={id} />
      <Input name="reason" placeholder="Motivo" className="h-8 w-32 py-1 text-xs" />
      <Button size="sm" variant="danger">Anular</Button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted">No</button>
    </ActionForm>
  );
}

export function NotesForm({ action, customerId, notes, tags }: { action: FormAction; customerId: string; notes: string | null; tags: string[] }) {
  const tagText = useMemo(() => tags.join(", "), [tags]);
  return (
    <ActionForm action={action} className="space-y-3">
      <input type="hidden" name="customerId" value={customerId} />
      <Field label="Etiquetas" hint="Separadas por comas. Ej: top, pies, problemático"><Input name="tags" defaultValue={tagText} maxLength={500} /></Field>
      <Field label="Notas privadas"><Textarea name="notes" defaultValue={notes ?? ""} maxLength={4000} placeholder="Solo las veis vosotros." /></Field>
      <Button variant="secondary">Guardar notas</Button>
    </ActionForm>
  );
}


