import "server-only";
import { env } from "@/modules/core/env";
import { AppError } from "@/modules/core/errors";
import { upsertCustomer, type Customer } from "@/modules/customers/repo";
import { InitDataError, validateInitData, type TelegramWebAppUser } from "./initData";

/** Extrae initData de la cabecera "Authorization: tma <initData>". */
export function extractInitData(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const [scheme, ...rest] = header.split(" ");
  return scheme?.toLowerCase() === "tma" && rest.length ? rest.join(" ").trim() : null;
}

/**
 * Identifica al cliente de la MiniApp validando la firma de Telegram. Sin
 * initData válido no se devuelve ningún dato personal ni se registra nada.
 */
export async function authenticateMiniApp(request: Request): Promise<{ customer: Customer; tgUser: TelegramWebAppUser }> {
  const initData = extractInitData(request);
  if (!initData) throw new AppError("unauthorized", "Abre la tienda desde el bot de Telegram.", 401);
  let tgUser: TelegramWebAppUser;
  try {
    const validated = validateInitData(initData, env().TELEGRAM_BOT_TOKEN, { maxAgeSeconds: env().TELEGRAM_INIT_DATA_MAX_AGE_SECONDS });
    tgUser = validated.user;
  } catch (error) {
    if (error instanceof InitDataError) {
      throw new AppError("unauthorized", error.code === "expired" ? "La sesión ha caducado. Cierra y vuelve a abrir la tienda." : "Abre la tienda desde el bot de Telegram.", 401);
    }
    throw error;
  }
  const customer = await upsertCustomer({
    id: tgUser.id,
    username: tgUser.username,
    first_name: tgUser.first_name,
    last_name: tgUser.last_name,
    language_code: tgUser.language_code,
  });
  return { customer, tgUser };
}
