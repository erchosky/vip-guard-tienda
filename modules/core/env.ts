import "server-only";
import { z } from "zod";

/**
 * Variables de entorno. Solo contienen secretos e infraestructura: todo lo que
 * sea contenido o configuración de negocio vive en la base de datos y se edita
 * desde el panel.
 */
const schema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  TELEGRAM_BOT_TOKEN: z.string().regex(/^\d{5,16}:[A-Za-z0-9_-]{20,}$/, "TELEGRAM_BOT_TOKEN no tiene formato de token de BotFather"),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(16).regex(/^[A-Za-z0-9_-]+$/, "TELEGRAM_WEBHOOK_SECRET solo admite A-Z, a-z, 0-9, _ y -"),
  ADMIN_PASSWORD: z.string().min(10, "ADMIN_PASSWORD debe tener al menos 10 caracteres"),
  SESSION_SECRET: z.string().min(32),
  CRON_SECRET: z.string().min(16),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  TELEGRAM_INIT_DATA_MAX_AGE_SECONDS: z.coerce.number().int().min(60).max(86_400).default(86_400),
});

export type Env = z.infer<typeof schema>;

let cache: Env | null = null;

export function env(): Env {
  if (cache) return cache;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Configuración incompleta: ${detail}`);
  }
  cache = parsed.data;
  return cache;
}

/** URL pública de la app sin barra final. */
export function appUrl(): string {
  return env().NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
}

/** Para tests: olvida la configuración leída. */
export function resetEnvCache() {
  cache = null;
}
