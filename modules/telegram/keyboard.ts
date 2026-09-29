/** Botones inline de Telegram (serializables para guardarlos en el outbox). */
export type InlineButton =
  | { text: string; url: string }
  | { text: string; callback_data: string }
  | { text: string; web_app: { url: string } };

export type Keyboard = InlineButton[][];

export function keyboard(rows: Array<Array<InlineButton | null | undefined | false>>): Keyboard | undefined {
  const clean = rows.map((row) => row.filter((b): b is InlineButton => Boolean(b))).filter((row) => row.length > 0);
  return clean.length > 0 ? clean : undefined;
}
