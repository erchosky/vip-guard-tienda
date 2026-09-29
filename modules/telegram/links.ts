/**
 * Enlace a un chat privado de Telegram con el mensaje ya escrito.
 * El cliente solo tiene que pulsar enviar.
 */
export function chatLink(username: string, text?: string): string | null {
  const clean = username.replace(/^@/, "").trim();
  if (!/^[A-Za-z0-9_]{5,32}$/.test(clean)) return null;
  const base = `https://t.me/${clean}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

export function displayName(customer: { first_name?: string | null; last_name?: string | null; username?: string | null; telegram_id?: number | string | null }): string {
  const name = [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim();
  if (name && customer.username) return `${name} (@${customer.username})`;
  if (name) return name;
  if (customer.username) return `@${customer.username}`;
  return `ID ${customer.telegram_id ?? "?"}`;
}
