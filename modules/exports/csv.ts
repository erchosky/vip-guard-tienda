/**
 * CSV compatible con Excel (y Numbers) en español: UTF-8 con BOM, separador
 * punto y coma, decimales con coma. Protege contra "CSV injection" (celdas
 * que empiezan por = + - @ se neutralizan).
 */
export type Column<T> = { header: string; value: (row: T) => string | number | boolean | null | undefined };

function cell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = typeof value === "boolean" ? (value ? "sí" : "no") : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[";\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv<T>(rows: T[], columns: Column<T>[]): string {
  const lines = [columns.map((c) => cell(c.header)).join(";")];
  for (const row of rows) lines.push(columns.map((c) => cell(c.value(row))).join(";"));
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** 1990 → "19,90" (número que Excel en español entiende). */
export function csvMoney(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}
