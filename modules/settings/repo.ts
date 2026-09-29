import "server-only";
import { db } from "@/modules/core/db";
import { AppError } from "@/modules/core/errors";
import { SETTINGS_SCHEMAS, parseSettings, type Settings, type SettingsKey } from "./schema";

export async function getSettings<K extends SettingsKey>(key: K): Promise<Settings<K>> {
  const { data, error } = await db().from("settings").select("value").eq("key", key).maybeSingle();
  if (error) console.error("settings_load_failed", key, error.message);
  return parseSettings(key, data?.value);
}

export async function getManySettings<K extends SettingsKey>(keys: readonly K[]): Promise<{ [P in K]: Settings<P> }> {
  const { data, error } = await db().from("settings").select("key, value").in("key", keys as readonly string[]);
  if (error) console.error("settings_load_failed", keys.join(","), error.message);
  const rows = new Map((data ?? []).map((row) => [row.key as string, row.value]));
  return Object.fromEntries(keys.map((key) => [key, parseSettings(key, rows.get(key))])) as { [P in K]: Settings<P> };
}

/** Guarda un bloque de ajustes validando y fusionando con lo que ya había. */
export async function saveSettings<K extends SettingsKey>(key: K, patch: Partial<Settings<K>>): Promise<Settings<K>> {
  const current = await getSettings(key);
  const parsed = SETTINGS_SCHEMAS[key].safeParse({ ...current, ...patch });
  if (!parsed.success) {
    throw new AppError("invalid_settings", parsed.error.issues[0]?.message ?? "Datos no válidos.");
  }
  const { error } = await db().from("settings").upsert({ key, value: parsed.data }, { onConflict: "key" });
  if (error) throw new AppError("db_error", "No se pudieron guardar los ajustes.", 500, { message: error.message });
  return parsed.data as Settings<K>;
}
