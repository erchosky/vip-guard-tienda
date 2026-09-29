import Link from "next/link";
import { CheckCircle2, CircleAlert, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { daysLeft, formatDate, timeLeft } from "@/modules/core/dates";
import type { SetupItem } from "@/modules/admin/health";

export function Avatar({ name, className }: { name: string | null | undefined; className?: string }) {
  const initial = (name ?? "?").trim().charAt(0).toUpperCase() || "?";
  return <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent", className)}>{initial}</span>;
}

export function customerName(c: { first_name?: string | null; last_name?: string | null; username?: string | null; telegram_id?: number | string }) {
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || (c.username ? `@${c.username}` : `ID ${c.telegram_id}`);
}

export function VipBadge({ status, endsAt }: { status: "active" | "expired" | "none"; endsAt: string | null }) {
  if (status === "active" && endsAt) {
    const days = daysLeft(endsAt);
    return <Badge tone={days <= 3 ? "warning" : "success"} dot>VIP · {timeLeft(endsAt)}</Badge>;
  }
  if (status === "expired") return <Badge tone="neutral">Caducó {endsAt ? formatDate(endsAt) : ""}</Badge>;
  return <Badge tone="neutral">Sin VIP</Badge>;
}

export function SetupChecklist({ items }: { items: SetupItem[] }) {
  const pending = items.filter((i) => !i.ok);
  if (pending.length === 0) return null;
  return (
    <section className="card mb-6 overflow-hidden border-accent/30">
      <div className="border-b border-line bg-accent-soft px-4 py-3 sm:px-5">
        <p className="font-semibold text-accent">Puesta en marcha · te faltan {pending.length} de {items.length} pasos</p>
        <p className="text-[13px] text-muted">Cuando todo esté en verde, el bot funciona solo.</p>
      </div>
      <ul className="divide-y divide-line">
        {items.map((item) => (
          <li key={item.key}>
            <Link href={item.href} className="flex items-center gap-3 px-4 py-3 hover:bg-subtle sm:px-5">
              {item.ok ? <CheckCircle2 className="h-5 w-5 shrink-0 text-success" /> : <CircleAlert className="h-5 w-5 shrink-0 text-warning" />}
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{item.label}</span>
                <span className="block truncate text-[13px] text-muted">{item.detail}</span>
              </span>
              <ChevronRight className="h-4 w-4 text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export const METHOD_LABEL: Record<string, string> = { bizum: "Bizum", paypal: "PayPal", transferencia: "Transferencia", efectivo: "Efectivo", otro: "Otro" };
export const KIND_LABEL: Record<string, string> = { first: "Alta", renewal: "Renovación", gift: "Regalo", adjustment: "Ajuste" };
