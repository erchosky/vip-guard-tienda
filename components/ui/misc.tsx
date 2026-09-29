import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "./cn";

export function PageHeader({ title, description, actions, back }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3 sm:mb-6">
      <div className="min-w-0">
        {back ? (
          <Link href={back.href} className="mb-1 inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">
            ← {back.label}
          </Link>
        ) : null}
        <h1 className="text-[22px] font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Stat({ label, value, hint, tone, href }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: "accent" | "danger" | "warning" | "success"; href?: string }) {
  const body = (
    <div className={cn("card h-full p-4 transition", href && "hover:border-accent/40")}>
      <p className="text-[13px] text-muted">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums tracking-tight", tone === "accent" && "text-accent", tone === "danger" && "text-danger", tone === "warning" && "text-warning", tone === "success" && "text-success")}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
    </div>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon ? <div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-subtle text-muted">{icon}</div> : null}
      <p className="font-medium">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** Filtros tipo "chips" que funcionan con enlaces (sin JavaScript). */
export function FilterChips({ items, active }: { items: Array<{ key: string; label: ReactNode; href: string; count?: number }>; active: string }) {
  return (
    <nav className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition",
            item.key === active ? "border-accent bg-accent text-accent-fg" : "border-line bg-surface text-muted hover:text-fg",
          )}
        >
          {item.label}
          {item.count !== undefined ? <span className={cn("tabular-nums", item.key === active ? "opacity-80" : "text-muted")}>{item.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

export function Pagination({ page, pageSize, total, hrefFor }: { page: number; pageSize: number; total: number; hrefFor: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm sm:px-5">
      <span className="text-muted">Página {page} de {pages} · {total} en total</span>
      <div className="flex gap-2">
        {page > 1 ? <Link className="rounded-lg border border-line px-3 py-1.5 hover:bg-subtle" href={hrefFor(page - 1)}>Anterior</Link> : null}
        {page < pages ? <Link className="rounded-lg border border-line px-3 py-1.5 hover:bg-subtle" href={hrefFor(page + 1)}>Siguiente</Link> : null}
      </div>
    </div>
  );
}

export function SearchBox({ defaultValue, placeholder, hidden }: { defaultValue?: string; placeholder: string; hidden?: Record<string, string | undefined> }) {
  return (
    <form className="relative w-full sm:max-w-xs" role="search">
      {Object.entries(hidden ?? {}).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      <input name="q" defaultValue={defaultValue} placeholder={placeholder} className="input pl-9" type="search" />
    </form>
  );
}

export function KeyValue({ items }: { items: Array<[ReactNode, ReactNode]> }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map(([k, v], i) => (
        <div key={i} className="min-w-0">
          <dt className="text-xs text-muted">{k}</dt>
          <dd className="mt-0.5 truncate text-sm font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
