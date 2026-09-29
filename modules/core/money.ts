/** El dinero se maneja siempre en céntimos (enteros). */

const formatter = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const compact = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** 1990 → "19,90 €" */
export function euros(cents: number | null | undefined): string {
  return formatter.format((cents ?? 0) / 100);
}

/** 2000 → "20 €", 1990 → "19,9 €"… mejor para precios de tienda. */
export function eurosShort(cents: number | null | undefined): string {
  const value = (cents ?? 0) / 100;
  return Number.isInteger(value) ? compact.format(value) : formatter.format(value);
}

/**
 * Convierte lo que se escribe en un formulario ("19,90", "19.9", "20", "1.250,50")
 * a céntimos. Devuelve null si está vacío y lanza si no es válido.
 */
export function parseEuros(input: unknown): number | null {
  if (input === null || input === undefined) return null;
  const raw = String(input).trim().replace(/\s|€/g, "");
  if (raw === "") return null;
  let normalized = raw;
  if (raw.includes(",") && raw.includes(".")) {
    normalized = raw.lastIndexOf(",") > raw.lastIndexOf(".")
      ? raw.replace(/\./g, "").replace(",", ".")
      : raw.replace(/,/g, "");
  } else if (raw.includes(",")) {
    normalized = raw.replace(",", ".");
  }
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) throw new Error(`Importe no válido: ${raw}`);
  const cents = Math.round(Number(normalized) * 100);
  if (!Number.isSafeInteger(cents) || cents > 100_000_00) throw new Error(`Importe no válido: ${raw}`);
  return cents;
}

/** Céntimos → valor para rellenar un input ("19,90"). */
export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2).replace(".", ",").replace(/,00$/, "");
}

export function applyPercent(cents: number, percent: number): number {
  return Math.max(0, Math.round((cents * (100 - percent)) / 100));
}
