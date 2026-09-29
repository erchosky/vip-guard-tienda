/**
 * Catálogo de todos los textos editables. Cada texto tiene su versión original
 * aquí y el panel guarda solo los cambios (tabla text_overrides). Así siempre
 * se puede "restaurar el original" y añadir textos nuevos sin migraciones.
 */
export type TextSection = "vip" | "tienda";

export type TextDef = {
  section: TextSection;
  group: string;
  label: string;
  help?: string;
  vars: readonly string[];
  default: string;
  /** Textos de botón: una sola línea y cortos. */
  short?: boolean;
};

export const VARIABLE_HELP: Record<string, string> = {
  nombre: "Nombre del cliente en Telegram",
  creadora: "Tu nombre de marca (Tienda → Ajustes)",
  usuario_creadora: "Tu @usuario de Telegram, sin @",
  dias_restantes: "Tiempo que le queda (ej. «3 días»)",
  fecha_fin: "Día y hora en que termina su VIP",
  tiempo_restante: "Tiempo hasta que termina (ej. «1 día»)",
  plan: "Nombre del plan",
  precio: "Precio",
  duracion: "Duración del plan (ej. «30 días»)",
  planes: "Lista de planes con precio",
  dias: "Número de días",
  producto: "Nombre del producto",
  talla: "Talla del producto",
  color: "Color del producto",
  precio_vip: "Precio para miembros VIP",
  tiempo: "Tiempo que queda de oferta",
  cliente: "Nombre y @usuario del cliente",
  es_vip: "«sí» o «no»",
  compras: "Número de compras anteriores del cliente",
  estado: "Estado de su VIP",
};

export const TEXTS = {
  // ─────────────────────────── Bot · bienvenida y menú ───────────────────────────
  "bot.welcome": {
    section: "vip", group: "Bienvenida y menú", label: "Mensaje de /start",
    help: "Lo primero que ve alguien al abrir el bot.",
    vars: ["nombre", "creadora"],
    default: "¡Hola {nombre}! 💋\n\nBienvenido/a a mi rincón. Desde aquí puedes entrar a mi canal VIP y ver mi tienda.",
  },
  "bot.status_active": {
    section: "vip", group: "Bienvenida y menú", label: "Estado: es VIP",
    vars: ["nombre", "dias_restantes", "fecha_fin"],
    default: "👑 Eres VIP. Te quedan {dias_restantes} (hasta el {fecha_fin}).",
  },
  "bot.status_expired": {
    section: "vip", group: "Bienvenida y menú", label: "Estado: VIP caducado",
    vars: ["nombre", "fecha_fin"],
    default: "Tu VIP terminó el {fecha_fin}. Puedes volver cuando quieras 💋",
  },
  "bot.status_none": {
    section: "vip", group: "Bienvenida y menú", label: "Estado: todavía no es VIP",
    vars: ["nombre"],
    default: "Todavía no eres VIP. Mira los planes con el botón 👑",
  },
  "bot.help": {
    section: "vip", group: "Bienvenida y menú", label: "Ayuda (/ayuda)",
    vars: ["creadora", "usuario_creadora"],
    default: "ℹ️ Cómo funciona:\n\n👑 VIP: elige un plan, escríbeme y paga por Bizum o PayPal. Te doy acceso al canal al momento.\n🛍️ Tienda: mira lo que tengo disponible y pulsa «Me interesa».\n\n¿Dudas? Escríbeme[ a @{usuario_creadora}].",
  },
  "bot.unknown": {
    section: "vip", group: "Bienvenida y menú", label: "Si alguien escribe al bot",
    help: "El bot no es un chat: esto responde a cualquier mensaje suelto (como mucho una vez cada 10 minutos).",
    vars: ["creadora", "usuario_creadora"],
    default: "Por aquí no leo mensajes 🙈 Usa los botones de abajo[ o escríbeme a @{usuario_creadora}].",
  },
  "bot.button_shop": { section: "vip", group: "Botones", label: "Botón tienda", vars: [], short: true, default: "🛍️ Ver tienda" },
  "bot.button_vip": { section: "vip", group: "Botones", label: "Botón VIP", vars: [], short: true, default: "👑 VIP" },
  "bot.button_help": { section: "vip", group: "Botones", label: "Botón ayuda", vars: [], short: true, default: "ℹ️ Ayuda" },
  "bot.button_join": { section: "vip", group: "Botones", label: "Botón entrar al canal", vars: [], short: true, default: "🔓 Entrar al canal" },
  "bot.button_contact": { section: "vip", group: "Botones", label: "Botón escribirme", vars: ["creadora"], short: true, default: "💬 Escribir a {creadora}" },
  "bot.button_plan": { section: "vip", group: "Botones", label: "Botón de cada plan", vars: ["plan", "precio"], short: true, default: "👑 {plan} · {precio}" },

  // ─────────────────────────── Bot · planes y acceso ───────────────────────────
  "bot.plans": {
    section: "vip", group: "Planes y acceso", label: "Lista de planes",
    help: "Se envía al pulsar «VIP» si no es miembro o para renovar.",
    vars: ["nombre", "planes", "creadora"],
    default: "👑 Planes VIP\n\n{planes}\n\nPulsa el que quieras y me escribes para pagar por Bizum o PayPal. En cuanto lo confirme te llega el acceso aquí.",
  },
  "bot.plan_line": {
    section: "vip", group: "Planes y acceso", label: "Cada línea de la lista de planes",
    vars: ["plan", "precio", "duracion"],
    default: "• {plan}: {precio} ({duracion})",
  },
  "bot.plan_chosen": {
    section: "vip", group: "Planes y acceso", label: "Tras elegir un plan en el bot",
    help: "Va con un botón que abre tu chat con el mensaje del plan ya escrito.",
    vars: ["nombre", "plan", "precio"],
    default: "¡Genial! 👑 Pulsa el botón y envíame el mensaje. Te digo cómo pagar el plan {plan} ({precio}).",
  },
  "bot.access_granted": {
    section: "vip", group: "Planes y acceso", label: "Acceso concedido (alta)",
    help: "Se envía solo al registrar el primer pago.",
    vars: ["nombre", "fecha_fin", "plan", "dias_restantes"],
    default: "✅ ¡Ya eres VIP, {nombre}! 💋\n\nTienes acceso hasta el {fecha_fin}. Pulsa el botón para entrar al canal.",
  },
  "bot.access_renewed": {
    section: "vip", group: "Planes y acceso", label: "Renovación confirmada",
    vars: ["nombre", "fecha_fin", "plan", "dias_restantes"],
    default: "✅ ¡Renovado! Ahora tu VIP dura hasta el {fecha_fin}. Gracias por seguir conmigo 💋",
  },
  "bot.access_back": {
    section: "vip", group: "Planes y acceso", label: "Vuelve tras caducar",
    help: "Renovación de alguien que ya estaba fuera del canal.",
    vars: ["nombre", "fecha_fin", "plan", "dias_restantes"],
    default: "✅ ¡Qué bien tenerte de vuelta, {nombre}! Tu VIP dura hasta el {fecha_fin}. Pulsa el botón para volver a entrar al canal.",
  },
  "bot.days_gifted": {
    section: "vip", group: "Planes y acceso", label: "Días regalados",
    vars: ["nombre", "dias", "fecha_fin"],
    default: "🎁 Te he regalado {dias} días de VIP. Ahora tienes hasta el {fecha_fin} 💋",
  },
  "bot.join_denied": {
    section: "vip", group: "Planes y acceso", label: "Alguien sin VIP pide entrar al canal",
    help: "La solicitud se rechaza y se le envía esto junto con los planes.",
    vars: ["nombre"],
    default: "Para entrar al canal necesitas ser VIP 👑\n\nEstos son los planes:",
  },
  "bot.join_approved": {
    section: "vip", group: "Planes y acceso", label: "Solicitud aprobada",
    vars: ["nombre", "fecha_fin"],
    default: "¡Dentro! Disfruta del canal, {nombre} 💋",
  },

  // ─────────────────────────── Bot · avisos ───────────────────────────
  "bot.reminder": {
    section: "vip", group: "Avisos de caducidad", label: "Aviso antes de caducar",
    help: "Se envía con la antelación configurada en «Canal».",
    vars: ["nombre", "tiempo_restante", "fecha_fin", "creadora"],
    default: "⏳ ¡Hola {nombre}! Tu VIP termina en {tiempo_restante} ({fecha_fin}).\n\nSi quieres seguir dentro, renueva con el botón 👇",
  },
  "bot.expired": {
    section: "vip", group: "Avisos de caducidad", label: "VIP terminado",
    vars: ["nombre", "creadora"],
    default: "Tu VIP ha terminado 😢 Ya no tienes acceso al canal, pero puedes volver cuando quieras.",
  },

  // ─────────────────────────── Avisos para ti ───────────────────────────
  "alert.interest": {
    section: "vip", group: "Avisos que te manda el bot", label: "Nuevo «Me interesa»",
    vars: ["cliente", "producto", "precio", "es_vip", "compras"],
    default: "🔔 Nuevo interés\n\n{cliente} quiere «{producto}» · {precio}\nVIP: {es_vip} · Compras: {compras}",
  },
  "alert.plan_request": {
    section: "vip", group: "Avisos que te manda el bot", label: "Alguien quiere un plan VIP",
    vars: ["cliente", "plan", "precio", "estado"],
    default: "👑 {cliente} quiere el plan {plan} ({precio})\nEstado: {estado}",
  },
  "alert.problem": {
    section: "vip", group: "Avisos que te manda el bot", label: "Problema importante",
    help: "Solo para cosas graves: el bot pierde permisos o no puede echar a alguien.",
    vars: ["cliente"],
    default: "⚠️ Hay algo que revisar en el panel.",
  },

  // ─────────────────────────── Tienda · MiniApp ───────────────────────────
  "shop.title": { section: "tienda", group: "Portada", label: "Título de la tienda", vars: ["creadora"], short: true, default: "Tienda de {creadora}" },
  "shop.subtitle": { section: "tienda", group: "Portada", label: "Subtítulo", vars: ["creadora"], default: "Piezas usadas y contenido exclusivo. Pulsa «Me interesa» y hablamos por privado 💋" },
  "shop.empty": { section: "tienda", group: "Portada", label: "Tienda vacía", vars: [], default: "Ahora mismo no hay nada disponible. ¡Vuelve pronto!" },
  "shop.all": { section: "tienda", group: "Portada", label: "Filtro «Todo»", vars: [], short: true, default: "Todo" },
  "shop.cta_interest": { section: "tienda", group: "Ficha de producto", label: "Botón «Me interesa»", vars: [], short: true, default: "Me interesa 💋" },
  "shop.cta_reserved": { section: "tienda", group: "Ficha de producto", label: "Botón si está reservado", vars: [], short: true, default: "Reservado · avísame si se libera" },
  "shop.badge_offer": { section: "tienda", group: "Etiquetas", label: "Etiqueta oferta", vars: [], short: true, default: "OFERTA" },
  "shop.badge_sold": { section: "tienda", group: "Etiquetas", label: "Etiqueta vendido", vars: [], short: true, default: "VENDIDO" },
  "shop.badge_reserved": { section: "tienda", group: "Etiquetas", label: "Etiqueta reservado", vars: [], short: true, default: "RESERVADO" },
  "shop.badge_unique": { section: "tienda", group: "Etiquetas", label: "Etiqueta pieza única", vars: [], short: true, default: "Pieza única" },
  "shop.badge_digital": { section: "tienda", group: "Etiquetas", label: "Etiqueta digital", vars: [], short: true, default: "Digital" },
  "shop.offer_ends": { section: "tienda", group: "Ficha de producto", label: "Cuenta atrás de oferta", vars: ["tiempo"], short: true, default: "Termina en {tiempo}" },
  "shop.vip_price": { section: "tienda", group: "Precio VIP", label: "Etiqueta del precio para VIP", vars: [], short: true, default: "👑 Tu precio VIP" },
  "shop.vip_upsell": { section: "tienda", group: "Precio VIP", label: "Gancho para quien no es VIP", vars: ["precio_vip"], short: true, default: "👑 VIP: {precio_vip} · Hazte VIP" },
  "shop.shipping_note": { section: "tienda", group: "Ficha de producto", label: "Nota de envío (físicos)", vars: [], default: "📦 Envío a tu casa. Los gastos de envío los paga el comprador." },
  "shop.digital_note": { section: "tienda", group: "Ficha de producto", label: "Nota de entrega (digitales)", vars: [], default: "📲 Te lo envío por privado en cuanto confirme el pago." },
  "shop.interest_done": { section: "tienda", group: "Ficha de producto", label: "Tras pulsar «Me interesa»", vars: ["creadora"], default: "¡Listo! Se ha abierto mi chat con el mensaje escrito. Solo tienes que darle a enviar 💋" },
  "shop.size": { section: "tienda", group: "Ficha de producto", label: "Rótulo talla", vars: [], short: true, default: "Talla" },
  "shop.color": { section: "tienda", group: "Ficha de producto", label: "Rótulo color", vars: [], short: true, default: "Color" },

  "miniapp.tab_shop": { section: "tienda", group: "Navegación", label: "Pestaña tienda", vars: [], short: true, default: "Tienda" },
  "miniapp.tab_vip": { section: "tienda", group: "Navegación", label: "Pestaña VIP", vars: [], short: true, default: "VIP" },
  "vip.active_title": { section: "tienda", group: "Pestaña VIP", label: "Título si es VIP", vars: ["nombre"], short: true, default: "Eres VIP 👑" },
  "vip.active_body": { section: "tienda", group: "Pestaña VIP", label: "Texto si es VIP", vars: ["dias_restantes", "fecha_fin"], default: "Te quedan {dias_restantes}. Tu acceso termina el {fecha_fin}." },
  "vip.expired_title": { section: "tienda", group: "Pestaña VIP", label: "Título si caducó", vars: ["nombre"], short: true, default: "Te echo de menos 😢" },
  "vip.expired_body": { section: "tienda", group: "Pestaña VIP", label: "Texto si caducó", vars: ["fecha_fin"], default: "Tu VIP terminó el {fecha_fin}. Vuelve cuando quieras." },
  "vip.none_title": { section: "tienda", group: "Pestaña VIP", label: "Título si no es VIP", vars: ["nombre"], short: true, default: "Entra en mi canal VIP" },
  "vip.none_body": { section: "tienda", group: "Pestaña VIP", label: "Texto si no es VIP", vars: ["creadora"], default: "Contenido que no subo en ningún otro sitio, precios especiales en la tienda y trato directo conmigo." },
  "vip.plan_cta": { section: "tienda", group: "Pestaña VIP", label: "Botón de plan", vars: [], short: true, default: "Lo quiero" },
  "vip.renew_cta": { section: "tienda", group: "Pestaña VIP", label: "Botón de renovar", vars: [], short: true, default: "Renovar" },
  "vip.join_cta": { section: "tienda", group: "Pestaña VIP", label: "Botón entrar al canal", vars: [], short: true, default: "Entrar al canal" },
  "vip.first_price": { section: "tienda", group: "Pestaña VIP", label: "Rótulo precio de alta", vars: [], short: true, default: "Alta" },
  "vip.renewal_price": { section: "tienda", group: "Pestaña VIP", label: "Rótulo precio de renovación", vars: [], short: true, default: "Renovación" },
  "vip.plan_done": { section: "tienda", group: "Pestaña VIP", label: "Tras pulsar un plan", vars: ["creadora"], default: "¡Genial! Se ha abierto mi chat con el mensaje escrito. Envíamelo y te digo cómo pagar 💋" },

  // ─────────────────────────── Plantillas de mensaje ───────────────────────────
  "template.interest": {
    section: "tienda", group: "Mensajes que te envía el cliente", label: "Mensaje «Me interesa»",
    help: "Se abre tu chat con este texto ya escrito; el cliente solo pulsa enviar. Lo que va entre [corchetes] solo aparece si el producto tiene ese dato.",
    vars: ["producto", "precio", "talla", "color", "creadora", "nombre"],
    default: "¡Hola {creadora}! 😊 Me interesa tu {producto}[ (talla {talla})][ en {color}] de {precio}. ¿Sigue disponible?",
  },
  "template.plan": {
    section: "tienda", group: "Mensajes que te envía el cliente", label: "Mensaje «Quiero un plan VIP»",
    vars: ["plan", "precio", "duracion", "creadora", "nombre"],
    default: "¡Hola {creadora}! Quiero el plan VIP {plan} ({precio}) 👑 ¿Cómo te pago?",
  },
} as const satisfies Record<string, TextDef>;

export type TextKey = keyof typeof TEXTS;

export function isTextKey(value: string): value is TextKey {
  return Object.prototype.hasOwnProperty.call(TEXTS, value);
}

export function textsBySection(section: TextSection): Array<{ group: string; items: Array<{ key: TextKey } & TextDef> }> {
  const groups = new Map<string, Array<{ key: TextKey } & TextDef>>();
  for (const [key, def] of Object.entries(TEXTS) as Array<[TextKey, TextDef]>) {
    if (def.section !== section) continue;
    const list = groups.get(def.group) ?? [];
    list.push({ key, ...def });
    groups.set(def.group, list);
  }
  return [...groups.entries()].map(([group, items]) => ({ group, items }));
}
