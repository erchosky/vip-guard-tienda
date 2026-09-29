import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { monthLabel } from "@/modules/core/dates";

function shift(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function MonthPicker({ month, hrefFor }: { month: string; hrefFor: (month: string) => string }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-line bg-surface p-1">
      <Link href={hrefFor(shift(month, -1))} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-subtle" aria-label="Mes anterior"><ChevronLeft className="h-4 w-4" /></Link>
      <span className="min-w-[140px] text-center text-sm font-medium capitalize">{monthLabel(month)}</span>
      <Link href={hrefFor(shift(month, 1))} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-subtle" aria-label="Mes siguiente"><ChevronRight className="h-4 w-4" /></Link>
    </div>
  );
}

export function validMonth(value: string | undefined, fallback: string) {
  return value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : fallback;
}
