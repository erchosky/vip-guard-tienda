import "server-only";
import { tg, classifyTelegramError, failureLabel } from "@/modules/telegram/client";
import { AppError } from "@/modules/core/errors";
import { getChannel, updateChannel, type ChannelCheck } from "./repo";

/** Comprueba que el bot está en el canal con los permisos que necesita. */
export async function checkChannel(chatId: number): Promise<ChannelCheck> {
  try {
    const chat = await tg().getChat(chatId);
    const title = "title" in chat ? chat.title ?? null : null;
    const isChannel = chat.type === "channel";
    const protectedContent = "has_protected_content" in chat ? Boolean(chat.has_protected_content) : null;
    const me = await tg().getMe();
    const member = await tg().getChatMember(chatId, me.id);
    const botAdmin = member.status === "administrator" || member.status === "creator";
    const canInvite = member.status === "creator" || (member.status === "administrator" && Boolean(member.can_invite_users));
    const canRestrict = member.status === "creator" || (member.status === "administrator" && Boolean(member.can_restrict_members));
    return { ok: botAdmin && canInvite && canRestrict, found: true, isChannel, botAdmin, canInvite, canRestrict, protectedContent, title };
  } catch (error) {
    return {
      ok: false, found: false, isChannel: false, botAdmin: false, canInvite: false, canRestrict: false, protectedContent: null, title: null,
      error: failureLabel(classifyTelegramError(error)),
    };
  }
}

/** Guarda el canal elegido, lo comprueba y crea su enlace de solicitud de unión. */
export async function connectChannel(chatId: number): Promise<ChannelCheck> {
  if (!Number.isInteger(chatId) || chatId >= 0) throw new AppError("invalid_chat", "El ID del canal empieza por -100.");
  const check = await checkChannel(chatId);
  await updateChannel({ telegram_chat_id: chatId, title: check.title, last_check: check, last_checked_at: new Date().toISOString() });
  if (check.ok) await ensureInviteLink(true);
  return check;
}

export async function refreshChannelCheck(): Promise<ChannelCheck | null> {
  const channel = await getChannel();
  if (!channel.telegram_chat_id) return null;
  const check = await checkChannel(channel.telegram_chat_id);
  await updateChannel({ title: check.title ?? channel.title, last_check: check, last_checked_at: new Date().toISOString() });
  return check;
}

/**
 * Enlace del canal con "solicitar unirse": nadie entra sin que el bot apruebe
 * la solicitud, y solo aprueba a quien tiene VIP activo. Aunque el enlace se
 * comparta, no sirve a quien no ha pagado.
 */
export async function ensureInviteLink(regenerate = false): Promise<string> {
  const channel = await getChannel();
  if (!channel.telegram_chat_id) throw new AppError("channel_missing", "Primero conecta el canal VIP en «Canal».", 409);
  if (channel.invite_link && !regenerate) return channel.invite_link;
  try {
    if (channel.invite_link && regenerate) {
      await tg().revokeChatInviteLink(channel.telegram_chat_id, channel.invite_link).catch(() => undefined);
    }
    const link = await tg().createChatInviteLink(channel.telegram_chat_id, { name: "VIP", creates_join_request: true });
    await updateChannel({ invite_link: link.invite_link });
    return link.invite_link;
  } catch (error) {
    throw new AppError("invite_failed", `No se pudo crear el enlace del canal: ${failureLabel(classifyTelegramError(error))}.`, 502);
  }
}

/** Saca a alguien del canal sin vetarle (podrá volver si renueva). */
export async function removeFromChannel(chatId: number, telegramId: number): Promise<{ ok: true } | { ok: false; error: string; retryable: boolean }> {
  try {
    await tg().banChatMember(chatId, telegramId);
    await tg().unbanChatMember(chatId, telegramId, { only_if_banned: true });
    return { ok: true };
  } catch (error) {
    const failure = classifyTelegramError(error);
    // Si ya no estaba en el canal, el objetivo está cumplido.
    if (failure.kind === "chat_not_found" && /user not found|participant/i.test(failure.message)) return { ok: true };
    return { ok: false, error: failureLabel(failure), retryable: failure.kind === "network" || failure.kind === "rate_limited" || failure.kind === "no_rights" };
  }
}

/** Veto permanente: no puede volver a entrar aunque tenga el enlace. */
export async function banFromChannel(chatId: number, telegramId: number, banned: boolean) {
  try {
    if (banned) await tg().banChatMember(chatId, telegramId);
    else await tg().unbanChatMember(chatId, telegramId, { only_if_banned: true });
  } catch (error) {
    throw new AppError("ban_failed", failureLabel(classifyTelegramError(error)), 502);
  }
}
