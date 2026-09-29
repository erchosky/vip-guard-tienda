import { z } from "zod";

const username = z
  .string()
  .trim()
  .transform((value) => value.replace(/^@/, "").replace(/^https?:\/\/t\.me\//i, ""))
  .refine((value) => value === "" || /^[A-Za-z0-9_]{5,32}$/.test(value), "El @usuario de Telegram tiene entre 5 y 32 letras, números o _.");

export const SETTINGS_SCHEMAS = {
  brand: z.object({
    name: z.string().trim().min(1).max(40).default("Mi tienda"),
    tagline: z.string().trim().max(120).default(""),
    contactUsername: username.default(""),
    logoPath: z.string().nullable().default(null),
    logoUrl: z.string().url().nullable().default(null),
  }),
  shop: z.object({
    vipDiscountPercent: z.coerce.number().int().min(0).max(90).default(10),
    soldVisibleDays: z.coerce.number().int().min(0).max(60).default(3),
  }),
  vip: z.object({
    reminderHours: z.array(z.coerce.number().int().min(1).max(720)).max(5).default([24]),
  }),
  admin: z.object({
    telegramId: z.number().int().positive().nullable().default(null),
    telegramName: z.string().nullable().default(null),
    linkCode: z.string().nullable().default(null),
    linkCodeExpiresAt: z.string().nullable().default(null),
  }),
  features: z.object({
    broadcasts: z.boolean().default(false),
    interestAlerts: z.boolean().default(true),
    planRequestAlerts: z.boolean().default(true),
  }),
  detected_channels: z.object({
    list: z.array(z.object({ id: z.number().int(), title: z.string(), at: z.string() })).max(10).default([]),
  }),
} as const;

export type SettingsKey = keyof typeof SETTINGS_SCHEMAS;
export type Settings<K extends SettingsKey> = z.infer<(typeof SETTINGS_SCHEMAS)[K]>;

/** Valida lo guardado; si algo está corrupto usa los valores por defecto campo a campo. */
export function parseSettings<K extends SettingsKey>(key: K, raw: unknown): Settings<K> {
  const schema = SETTINGS_SCHEMAS[key];
  const parsed = schema.safeParse(raw ?? {});
  if (parsed.success) return parsed.data as Settings<K>;
  const defaults = schema.parse({}) as Record<string, unknown>;
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...defaults };
  for (const field of Object.keys(defaults)) {
    const attempt = schema.safeParse({ ...defaults, [field]: input[field] });
    if (attempt.success) merged[field] = (attempt.data as Record<string, unknown>)[field];
  }
  return merged as Settings<K>;
}
