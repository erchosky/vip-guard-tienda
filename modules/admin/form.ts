import { AppError } from "@/modules/core/errors";
import { parseEuros } from "@/modules/core/money";
import { madridLocalToDate } from "@/modules/core/dates";

/** Lectura segura de campos de formulario. */
export const f = {
  str(form: FormData, key: string, max = 2000): string {
    const value = form.get(key);
    return typeof value === "string" ? value.trim().slice(0, max) : "";
  },
  optStr(form: FormData, key: string, max = 2000): string | null {
    return f.str(form, key, max) || null;
  },
  required(form: FormData, key: string, label: string, max = 2000): string {
    const value = f.str(form, key, max);
    if (!value) throw new AppError("required", `Falta ${label}.`);
    return value;
  },
  uuid(form: FormData, key: string, label = "el identificador"): string {
    const value = f.str(form, key, 64);
    if (!/^[0-9a-f-]{36}$/i.test(value)) throw new AppError("invalid_id", `Falta ${label}.`);
    return value;
  },
  optUuid(form: FormData, key: string): string | null {
    const value = f.str(form, key, 64);
    return /^[0-9a-f-]{36}$/i.test(value) ? value : null;
  },
  int(form: FormData, key: string, fallback: number, min = -1_000_000, max = 1_000_000): number {
    const raw = f.str(form, key, 20);
    if (raw === "") return fallback;
    const value = Number.parseInt(raw, 10);
    if (!Number.isFinite(value) || value < min || value > max) throw new AppError("invalid_number", `El número «${raw}» no es válido.`);
    return value;
  },
  bool(form: FormData, key: string): boolean {
    const value = form.get(key);
    return value === "on" || value === "true" || value === "1";
  },
  money(form: FormData, key: string, label: string): number | null {
    try {
      return parseEuros(form.get(key));
    } catch {
      throw new AppError("invalid_money", `El importe de ${label} no es válido. Escribe por ejemplo 19,90.`);
    }
  },
  requiredMoney(form: FormData, key: string, label: string): number {
    const value = f.money(form, key, label);
    if (value === null) throw new AppError("required", `Falta ${label}.`);
    return value;
  },
  date(form: FormData, key: string): Date | null {
    const raw = f.str(form, key, 32);
    if (!raw) return null;
    const date = madridLocalToDate(raw);
    if (!date) throw new AppError("invalid_date", "Una de las fechas no es válida.");
    return date;
  },
  oneOf<T extends string>(form: FormData, key: string, options: readonly T[], fallback?: T): T {
    const value = f.str(form, key, 64) as T;
    if (options.includes(value)) return value;
    if (fallback !== undefined) return fallback;
    throw new AppError("invalid_option", "Elige una opción válida.");
  },
  json<T>(form: FormData, key: string, fallback: T): T {
    const raw = f.str(form, key, 20_000);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      throw new AppError("invalid_json", "Datos del formulario no válidos. Recarga la página.");
    }
  },
};
