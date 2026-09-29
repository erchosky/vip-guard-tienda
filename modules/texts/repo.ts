import "server-only";
import { db } from "@/modules/core/db";
import { AppError } from "@/modules/core/errors";
import { TEXTS, isTextKey, type TextKey } from "./catalog";
import { renderTemplate, unknownVariables, type TemplateVars } from "./render";

type Overrides = Map<string, string>;

const CACHE_MS = 15_000;
const store = globalThis as typeof globalThis & { __vipTexts?: { at: number; data: Overrides } };

/** Lee los textos editados (con caché corta para no consultar en cada mensaje). */
export async function loadOverrides(force = false): Promise<Overrides> {
  const cached = store.__vipTexts;
  if (!force && cached && Date.now() - cached.at < CACHE_MS) return cached.data;
  const { data, error } = await db().from("text_overrides").select("key, body");
  if (error) {
    console.error("text_overrides_load_failed", error.message);
    return cached?.data ?? new Map();
  }
  const map: Overrides = new Map((data ?? []).map((row) => [row.key as string, row.body as string]));
  store.__vipTexts = { at: Date.now(), data: map };
  return map;
}

export function invalidateTexts() {
  store.__vipTexts = undefined;
}

export type Translator = (key: TextKey, vars?: TemplateVars) => string;

/** Devuelve una función t(clave, variables) con los textos actuales. */
export async function getTranslator(baseVars: TemplateVars = {}): Promise<Translator> {
  const overrides = await loadOverrides();
  return (key, vars = {}) => renderTemplate(overrides.get(key) ?? TEXTS[key].default, { ...baseVars, ...vars });
}

/** Plantillas crudas (sin rellenar) de un conjunto de claves, para la MiniApp. */
export async function rawTexts(keys: readonly TextKey[]): Promise<Record<string, string>> {
  const overrides = await loadOverrides();
  return Object.fromEntries(keys.map((key) => [key, overrides.get(key) ?? TEXTS[key].default]));
}

export async function saveText(key: string, body: string): Promise<{ restored: boolean }> {
  if (!isTextKey(key)) throw new AppError("unknown_text", "Ese texto no existe.", 404);
  const def = TEXTS[key];
  const value = body.replace(/\r\n/g, "\n").trim();
  if (!value) throw new AppError("empty_text", "El texto no puede quedar vacío. Usa «Restaurar» para volver al original.");
  if (value.length > 4000) throw new AppError("long_text", "El texto es demasiado largo (máximo 4000 caracteres).");
  if ("short" in def && def.short && (value.includes("\n") || value.length > 64)) {
    throw new AppError("short_text", "Este texto es de un botón o etiqueta: una sola línea y como mucho 64 caracteres.");
  }
  const unknown = unknownVariables(value, def.vars);
  if (unknown.length > 0) {
    throw new AppError("unknown_vars", `Estas variables no existen en este texto: ${unknown.map((v) => `{${v}}`).join(", ")}.`);
  }
  if (value === def.default) {
    await restoreText(key);
    return { restored: true };
  }
  const { error } = await db().from("text_overrides").upsert({ key, body: value }, { onConflict: "key" });
  if (error) throw new AppError("db_error", "No se pudo guardar el texto.", 500, { message: error.message });
  invalidateTexts();
  return { restored: false };
}

export async function restoreText(key: string): Promise<void> {
  if (!isTextKey(key)) throw new AppError("unknown_text", "Ese texto no existe.", 404);
  const { error } = await db().from("text_overrides").delete().eq("key", key);
  if (error) throw new AppError("db_error", "No se pudo restaurar el texto.", 500, { message: error.message });
  invalidateTexts();
}
