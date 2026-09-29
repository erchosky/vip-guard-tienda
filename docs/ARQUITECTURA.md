# Arquitectura

Una sola aplicación Next.js 15 (App Router, Node 22) con Supabase (Postgres + Storage). Está organizada en módulos independientes: no son microservicios, porque a esta escala serían más caros, lentos y frágiles, pero cada dominio tiene su carpeta y sus límites.

## Módulos (`modules/`)

| Módulo | Responsabilidad |
|---|---|
| `core` | Entorno, cliente de base de datos, errores legibles, dinero en céntimos, fechas en hora de Madrid, historial y alertas, seguridad (rate limit, origen, comparación de secretos) |
| `auth` | Sesiones del panel: cookie firmada más hash en base de datos, así que se pueden revocar |
| `texts` | Catálogo de textos editables, motor de plantillas (`{var}` y `[opcional]`) y lectura de los cambios guardados |
| `settings` | Ajustes validados con zod (marca, tienda, VIP, admin, funciones) |
| `telegram` | Cliente de la API, bot, cola de mensajes, idempotencia del webhook, autenticación de la MiniApp, conexión del bot |
| `customers` | Clientes y listado del CRM |
| `vip` | Estado, planes, pagos y ajustes, canal, expulsiones, avisos y programador |
| `shop` | Precios, catálogo público, productos, categorías, fotos, ventas e intereses |
| `admin` | Envoltorio de las acciones del panel, lectura de formularios y comprobaciones de puesta en marcha |
| `exports` | CSV compatible con Excel |

## Base de datos

Una sola migración consolidada: `supabase/migrations/20260926000001_schema_v2.sql`.

- **Seguridad**: RLS activado en todas las tablas y sin políticas. Se revoca todo a `anon` y `authenticated`, y solo el servidor accede con `service_role`. La MiniApp nunca habla con Supabase directamente.
- **Dinero** en céntimos (`integer`). **Fechas** en `timestamptz`, que se muestran en Europe/Madrid.
- **El historial no se borra**: pagos (`vip_payments`) y ventas (`shop_sales`) se anulan, no se eliminan. Las claves foráneas usan `restrict` o `set null`, nunca cascada sobre el historial.
- **Operaciones atómicas en SQL**: `vip_register_payment`, `vip_adjust`, `vip_revoke`, `vip_expire_due`, `vip_claim_expulsions`, `vip_due_reminders`, `shop_register_sale`, `shop_register_interest`, `outbox_claim` y `outbox_complete`, con bloqueos `for update skip locked` donde hace falta concurrencia.
- **Textos**: los originales viven en `modules/texts/catalog.ts` y la tabla `text_overrides` solo guarda los cambios. Añadir un texto nuevo no requiere migración.

## Orquestación

- **Webhook** (`/api/telegram/webhook`): valida la cabecera secreta, limita el tamaño del cuerpo y reclama el `update_id` en la base de datos para procesarlo una sola vez. Si falla la infraestructura devuelve 500 y Telegram reintenta. Si falla la lógica, registra el error y no reintenta.
- **Cola de mensajes** (`message_outbox`): cada aviso lleva una clave de deduplicación y reintentos con espera creciente, respeta el `retry_after` de Telegram y marca como bloqueado a quien bloquea el bot. Las acciones del panel encolan y envían al momento con `sendNow`.
- **Programador** (`/api/cron/tick`): pg_cron llama cada minuto con `Authorization: Bearer CRON_SECRET`, y Vercel Cron una vez al día como respaldo. En cada vuelta, con un bloqueo `claim_job_lock` para que no se solapen:
  1. caduca las suscripciones vencidas;
  2. procesa las expulsiones pendientes (ban y unban, 6 reintentos con espera exponencial y alerta si fallan);
  3. encola los avisos de caducidad;
  4. vacía la cola de mensajes;
  5. a los :30 limpia las fotos huérfanas.
- **Entrada al canal**: un enlace con `creates_join_request`. En `chat_join_request` el bot aprueba si el VIP está activo; si no, escribe al usuario (por `user_chat_id`) y rechaza la solicitud.

## Seguridad

- MiniApp: `initData` validado con HMAC y caducidad configurable. Límite de peticiones por cliente.
- Panel: el middleware comprueba la firma, cada página comprueba la sesión en la base de datos y cada acción verifica mismo origen, sesión y límite de ritmo. El login se bloquea 15 minutos tras 5 fallos.
- Fotos: validación de firma real, tipo, tamaño (5 MB) y dimensiones en el servidor. Solo se borran rutas propias.
- CSP estricta, HSTS, `X-Frame-Options: DENY` en el panel y `noindex`.
- Exportaciones protegidas contra la inyección de fórmulas en Excel.

## Pruebas

| Comando | Qué prueba |
|---|---|
| `npm test` | Lógica pura: precios, plantillas, fechas, dinero, ajustes, validación de initData e imágenes, CSV |
| `npm run test:sql` | Migración y funciones SQL en un Postgres temporal (seguridad, ciclo VIP, tienda, cola, bloqueos) |
| `npm run local:stack` + `npm run local:dev` | La app completa contra Postgres real, PostgREST (el motor de Supabase), un Storage simulado y un Telegram simulado. `POST :54320/__update` simula mensajes al bot y `GET :54320/__messages` enseña lo que ha enviado. |

## Añadir un texto editable

1. Añade la clave en `modules/texts/catalog.ts` con su `section`, `group`, `label`, `vars` y `default`.
2. Úsalo con `ctx.t("clave", { variables })` en el servidor, o con `t("clave")` en la MiniApp si empieza por `shop.`, `vip.` o `miniapp.`.
3. Aparece solo en el panel. Un test comprueba que el texto por defecto solo usa sus variables.
