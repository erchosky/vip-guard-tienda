"use client";

import { useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { ActionForm, type FormAction } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { renderTemplate } from "@/modules/texts/render";

export type EditableText = { key: string; label: string; help?: string; vars: readonly string[]; value: string; original: string; edited: boolean; short?: boolean };

const SAMPLE: Record<string, string> = {
  nombre: "Laura", creadora: "Nina", usuario_creadora: "nina", dias_restantes: "3 días", fecha_fin: "12 de octubre a las 21:30",
  tiempo_restante: "1 día", plan: "1 mes", precio: "20 €", duracion: "1 mes", planes: "• 1 mes: 20 € (1 mes)\n• 3 meses: 50 € (3 meses)", dias: "7",
  producto: "Tanga rosa de encaje", talla: "S", color: "Rosa", precio_vip: "17 €", tiempo: "2 días", cliente: "Laura (@laura_22)",
  es_vip: "sí", compras: "3", estado: "nuevo",
};

/** Un texto editable con variables clicables y vista previa en vivo. */
export function TextItem({ text, saveAction, restoreAction, varHelp }: { text: EditableText; saveAction: FormAction; restoreAction: FormAction; varHelp: Record<string, string> }) {
  const [value, setValue] = useState(text.value);
  const ref = useRef<HTMLTextAreaElement | HTMLInputElement>(null);

  function insert(name: string) {
    const el = ref.current;
    const token = `{${name}}`;
    if (!el) return setValue((v) => v + token);
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    setValue(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + token.length, start + token.length); });
  }

  const preview = renderTemplate(value, SAMPLE);
  return (
    <div className="border-b border-line px-4 py-4 last:border-0 sm:px-5">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold">{text.label}</p>
        {text.edited ? <Badge tone="accent">Editado</Badge> : null}
      </div>
      {text.help ? <p className="-mt-1 mb-2 text-[13px] text-muted">{text.help}</p> : null}
      <ActionForm action={saveAction}>
        <input type="hidden" name="key" value={text.key} />
        {text.short ? (
          <input ref={ref as React.RefObject<HTMLInputElement>} name="body" value={value} onChange={(e) => setValue(e.target.value)} maxLength={64} className="input" />
        ) : (
          <textarea ref={ref as React.RefObject<HTMLTextAreaElement>} name="body" value={value} onChange={(e) => setValue(e.target.value)} rows={Math.min(12, Math.max(3, value.split("\n").length + Math.ceil(value.length / 60)))} maxLength={4000} className="input resize-y leading-relaxed" />
        )}
        {text.vars.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {text.vars.map((name) => (
              <button type="button" key={name} onClick={() => insert(name)} title={varHelp[name]} className="rounded-md border border-line bg-subtle px-2 py-0.5 font-mono text-xs text-muted hover:border-accent hover:text-accent">
                {`{${name}}`}
              </button>
            ))}
          </div>
        ) : null}
        {!text.short ? (
          <div className="mt-3 rounded-xl bg-subtle p-3">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Vista previa</p>
            <p className="whitespace-pre-wrap text-sm">{preview || <span className="text-muted">(vacío)</span>}</p>
          </div>
        ) : null}
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" disabled={value === text.value}>Guardar</Button>
          {value !== text.value ? <button type="button" className="text-xs text-muted hover:text-fg" onClick={() => setValue(text.value)}>Deshacer</button> : null}
        </div>
      </ActionForm>
      {text.edited ? (
        <ActionForm action={restoreAction} confirm="¿Volver al texto original?" className="mt-2">
          <input type="hidden" name="key" value={text.key} />
          <button className={cn("inline-flex items-center gap-1 text-xs text-muted hover:text-fg")}><RotateCcw className="h-3 w-3" /> Restaurar original</button>
        </ActionForm>
      ) : null}
    </div>
  );
}
