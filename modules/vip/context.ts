import "server-only";
import { getManySettings } from "@/modules/settings/repo";
import { getTranslator, type Translator } from "@/modules/texts/repo";

/**
 * Contexto común para construir mensajes: textos editables y datos de marca.
 * Las variables {creadora} y {usuario_creadora} están siempre disponibles.
 */
export type MessageContext = {
  t: Translator;
  brandName: string;
  contactUsername: string;
  adminTelegramId: number | null;
};

export async function messageContext(): Promise<MessageContext> {
  const { brand, admin } = await getManySettings(["brand", "admin"] as const);
  const t = await getTranslator({ creadora: brand.name, usuario_creadora: brand.contactUsername || null });
  return { t, brandName: brand.name, contactUsername: brand.contactUsername, adminTelegramId: admin.telegramId };
}
