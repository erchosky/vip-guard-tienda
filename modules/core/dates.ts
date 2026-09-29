/** Todas las fechas se guardan en UTC y se muestran en hora de Madrid. */
export const TIME_ZONE = "Europe/Madrid";

const dateFmt = new Intl.DateTimeFormat("es-ES", { timeZone: TIME_ZONE, day: "numeric", month: "long", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("es-ES", { timeZone: TIME_ZONE, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const shortFmt = new Intl.DateTimeFormat("es-ES", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
const dayMonthTime = new Intl.DateTimeFormat("es-ES", { timeZone: TIME_ZONE, day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "5 de octubre de 2026" */
export function formatDate(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date ? dateFmt.format(date) : "—";
}

/** "5 oct 2026, 18:30" */
export function formatDateTime(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date ? dateTimeFmt.format(date) : "—";
}

/** "05/10/26, 18:30" */
export function formatShort(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date ? shortFmt.format(date) : "—";
}

/** "5 de octubre a las 18:30" (para mensajes del bot) */
export function formatHuman(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return "—";
  return dayMonthTime.format(date).replace(/,\s*/, " a las ");
}

/** Tiempo restante legible: "3 días", "1 día y 4 horas", "5 horas", "20 minutos". */
export function timeLeft(until: string | Date | null | undefined, now = new Date()): string {
  const date = toDate(until);
  if (!date) return "—";
  const ms = date.getTime() - now.getTime();
  if (ms <= 0) return "0 minutos";
  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (days >= 2) return plural(days, "día", "días");
  if (days === 1) {
    const rest = hours - 24;
    return rest > 0 ? `1 día y ${plural(rest, "hora", "horas")}` : "1 día";
  }
  if (hours >= 1) return plural(hours, "hora", "horas");
  return plural(Math.max(1, minutes), "minuto", "minutos");
}

/** Días completos restantes (redondeando hacia arriba). */
export function daysLeft(until: string | Date | null | undefined, now = new Date()): number {
  const date = toDate(until);
  if (!date) return 0;
  return Math.max(0, Math.ceil((date.getTime() - now.getTime()) / 86_400_000));
}

function zonedParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

/** Diferencia en minutos entre Madrid y UTC para ese instante. */
function madridOffsetMinutes(date: Date): number {
  const p = zonedParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - date.getTime()) / 60_000);
}

/**
 * Convierte el valor de un <input type="datetime-local"> (hora de Madrid, sin
 * zona) a un Date real. "2026-10-02T20:00" → 2026-10-02T18:00Z (horario de verano).
 */
export function madridLocalToDate(local: string | null | undefined): Date | null {
  if (!local) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(local.trim());
  if (!match) return null;
  const [, y, mo, d, h = "00", mi = "00"] = match;
  const guess = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
  let result = guess - madridOffsetMinutes(new Date(guess)) * 60_000;
  // Segunda pasada por si el cambio de hora cae entre medias.
  result = guess - madridOffsetMinutes(new Date(result)) * 60_000;
  return new Date(result);
}

/** Date → valor para un <input type="datetime-local"> en hora de Madrid. */
export function dateToMadridLocal(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return "";
  const p = zonedParts(date);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** Inicio y fin (exclusivo) de un mes "2026-10" en hora de Madrid. */
export function monthRange(month: string): { from: Date; to: Date } {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new Error("Mes no válido");
  const year = Number(match[1]);
  const m = Number(match[2]);
  const from = madridLocalToDate(`${match[1]}-${match[2]}-01T00:00`)!;
  const nextYear = m === 12 ? year + 1 : year;
  const nextMonth = m === 12 ? 1 : m + 1;
  const to = madridLocalToDate(`${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00`)!;
  return { from, to };
}

/** Mes actual en Madrid: "2026-10". */
export function currentMonth(now = new Date()): string {
  const p = zonedParts(now);
  return `${p.year}-${String(p.month).padStart(2, "0")}`;
}

export function monthLabel(month: string): string {
  const { from } = monthRange(month);
  return new Intl.DateTimeFormat("es-ES", { timeZone: TIME_ZONE, month: "long", year: "numeric" }).format(from);
}
