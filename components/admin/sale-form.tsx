"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { ActionForm, type FormAction } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Field, Input, MoneyInput, Select } from "@/components/ui/field";
import { cn } from "@/components/ui/cn";

type CustomerHit = { id: string; name: string | null; username: string | null; telegramId: number; vip: string; purchases: number };
export type SaleProduct = { id: string; title: string; priceCents: number; status: string };

const toInput = (cents: number) => (cents / 100).toFixed(2).replace(".", ",").replace(/,00$/, "");
const METHODS = [
  { value: "bizum", label: "Bizum" },
  { value: "paypal", label: "PayPal" },
  { value: "transferencia", label: "Transferencia" },
  { value: "efectivo", label: "Efectivo" },
  { value: "otro", label: "Otro" },
];

export function CustomerPicker({ initial }: { initial?: { id: string; label: string } | null }) {
  const [selected, setSelected] = useState(initial ?? null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<CustomerHit[]>([]);
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState(false);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/customers?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        const json = await res.json();
        if (json.ok) setHits(json.data);
      } catch { /* cancelado */ }
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, open]);

  if (manual) {
    return (
      <Field label="Comprador" hint="Para alguien que no ha abierto el bot (por ejemplo, de Instagram).">
        <div className="flex gap-2">
          <Input name="buyerLabel" placeholder="Nombre o contacto" maxLength={120} required />
          <button type="button" className="text-xs text-muted underline" onClick={() => setManual(false)}>Buscar cliente</button>
        </div>
      </Field>
    );
  }
  return (
    <Field label="Cliente">
      <input type="hidden" name="customerId" value={selected?.id ?? ""} />
      {selected ? (
        <div className="flex h-10 items-center justify-between rounded-lg border border-accent bg-accent-soft px-3 text-sm">
          <span className="truncate font-medium">{selected.label}</span>
          <button type="button" onClick={() => setSelected(null)} aria-label="Quitar"><X className="h-4 w-4" /></button>
        </div>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder="Busca por nombre o @usuario" value={query} onChange={(e) => setQuery(e.target.value)} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
          {open ? (
            <div className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-line bg-surface shadow-pop">
              {hits.map((h) => (
                <button type="button" key={h.id} onMouseDown={(e) => e.preventDefault()} onClick={() => { setSelected({ id: h.id, label: `${h.name ?? ""}${h.username ? ` @${h.username}` : ""}`.trim() || `ID ${h.telegramId}` }); setOpen(false); }} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-subtle">
                  <span className="truncate">{h.name ?? "Sin nombre"} {h.username ? <span className="text-muted">@{h.username}</span> : null}</span>
                  <span className="shrink-0 text-xs text-muted">{h.vip === "active" ? "👑 " : ""}{h.purchases ? `${h.purchases} compras` : ""}</span>
                </button>
              ))}
              {hits.length === 0 ? <p className="px-3 py-2 text-sm text-muted">Sin resultados</p> : null}
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setManual(true)} className="w-full border-t border-line px-3 py-2 text-left text-sm text-accent hover:bg-subtle">No está: escribir el comprador a mano</button>
            </div>
          ) : null}
        </div>
      )}
    </Field>
  );
}

export function SaleForm({ action, products, defaultProductId, customer }: { action: FormAction; products: SaleProduct[]; defaultProductId?: string; customer?: { id: string; label: string } | null }) {
  const first = products.find((p) => p.id === defaultProductId) ?? products[0];
  const [productId, setProductId] = useState(first?.id ?? "");
  const [amount, setAmount] = useState(first ? toInput(first.priceCents) : "");
  const [method, setMethod] = useState("bizum");
  const [key, setKey] = useState(0);
  if (products.length === 0) return <p className="text-sm text-muted">No hay productos disponibles o reservados para vender.</p>;
  return (
    <ActionForm key={key} action={action} className="space-y-4" onSuccess={() => setKey((k) => k + 1)}>
      <input type="hidden" name="method" value={method} />
      <Field label="Producto">
        <Select name="productId" value={productId} onChange={(e) => { setProductId(e.target.value); const p = products.find((x) => x.id === e.target.value); if (p) setAmount(toInput(p.priceCents)); }}>
          {products.map((p) => <option key={p.id} value={p.id}>{p.title} · {toInput(p.priceCents)} €{p.status === "reserved" ? " (reservado)" : ""}</option>)}
        </Select>
      </Field>
      <CustomerPicker initial={customer} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Importe cobrado" hint="Sin contar el envío"><MoneyInput name="amount" value={amount} onChange={(e) => setAmount(e.target.value)} required /></Field>
        <Field label="Gastos de envío cobrados" hint="Opcional"><MoneyInput name="shipping" /></Field>
      </div>
      <Field label="Método">
        <div className="flex flex-wrap gap-1.5">
          {METHODS.map((m) => (
            <button type="button" key={m.value} onClick={() => setMethod(m.value)} className={cn("h-10 rounded-lg border px-3 text-sm", method === m.value ? "border-accent bg-accent text-accent-fg" : "border-line hover:bg-subtle")}>{m.label}</button>
          ))}
        </div>
      </Field>
      <Field label="Nota (opcional)"><Input name="note" maxLength={500} placeholder="Ej: enviado por Correos el lunes" /></Field>
      <Button>Registrar venta</Button>
    </ActionForm>
  );
}
