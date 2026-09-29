# Plan de rework — VIP Guard + Tienda

Documento de referencia del rework. Recoge las decisiones de producto tomadas con
Nina y Chosky (septiembre 2026) y el plan técnico por fases. Si algo del código
contradice este documento, manda este documento.

## 1. Qué es el producto

Un solo producto con cuatro piezas conectadas a la misma base de datos:

| Pieza | Quién la usa | Para qué |
|---|---|---|
| **Bot VIP Guard** | Clientes, en Telegram | Entrar al canal VIP de pago, ver su estado, recibir avisos, abrir la tienda |
| **Panel VIP Guard** | Nina y Chosky | Miembros, pagos, planes, textos del bot, canal, CRM, alertas |
| **MiniApp Tienda** | Cualquiera que abra el bot | Escaparate con fotos, precios, ofertas, precio VIP y botón "Me interesa" |
| **Panel Tienda** | Nina y Chosky | Productos, fotos, precios, ofertas, ventas, intereses, apariencia |

Los dos paneles son **un único panel** con un interruptor en la cabecera
(igual que el de modo claro/oscuro) para saltar de **VIP Guard ⇄ Tienda**.

Sin pasarela de pagos. Se cobra por **Bizum y PayPal**, fuera de la app, y se
registra en el panel. Solo español. Uso principal en móvil y Mac. Un único
usuario y contraseña compartidos.

## 2. Decisiones de producto

### VIP
- Es un **canal privado** (solo publica Nina), no un grupo.
- Entrada por **solicitud de unión**: el enlace del canal pide "solicitar
  unirse" y el bot **solo aprueba a quien tiene suscripción activa**. Si alguien
  sin VIP lo solicita, el bot le escribe por privado con los planes y después
  rechaza la solicitud (Telegram solo deja escribirle durante 5 minutos y antes
  de resolverla, vía `user_chat_id`).
- **Planes editables** desde el panel: nombre, duración, **precio de alta** y
  **precio de renovación** (pueden ser distintos), destacado, orden y
  visibilidad. El bot y la MiniApp muestran duración y precio.
- **Renovar suma los días** a lo que le queda. Si ya había caducado, cuenta
  desde ahora.
- **Registrar pago** es una sola acción en la ficha del cliente: se elige el plan
  (el importe se rellena solo con el precio de alta o de renovación que toque),
  el método (Bizum, PayPal u otro) y una nota opcional. Al guardar, en una sola
  operación: se guarda el pago, se suman los días y el bot le manda acceso.
- **Expulsión a la hora exacta** de caducidad (margen máximo de 1 minuto), con
  ban + unban para que pueda volver si renueva.
- **Aviso 1 día antes** por privado. Los avisos son configurables (cuándo y qué
  texto) y se pueden desactivar.
- Canal con **"restringir guardado de contenido"** activado (se hace en
  Telegram; el panel comprueba y avisa si está desactivado).

### Tienda
- Pública para todo el mundo. Detecta si quien mira es VIP.
- Producto: fotos (galería), título, descripción, **talla**, **color**,
  **precio**, **precio de oferta con fecha de inicio y fin** (vuelve solo al
  precio normal al terminar; la tienda muestra el precio tachado y "Termina en
  X"), **pieza única**, **envío físico** o **contenido digital**.
- **Precio VIP** (estrategia de marketing):
  - descuento VIP global en % configurable en el panel;
  - opcionalmente, un precio VIP fijo por producto que sustituye al global;
  - el VIP ve su precio con la etiqueta 👑 *Precio VIP*;
  - el no VIP ve el precio normal y debajo *"👑 VIP: 18 € · Hazte VIP"*, que
    lleva a los planes (sirve de gancho de venta).
- Estados: **Disponible → Reservado → Vendido**, más Oculto y Archivado. Al
  venderse, la pieza se queda unos días (configurable) con el sello **VENDIDO**
  para dar sensación de demanda y luego desaparece sola.
- **Gastos de envío siempre a cargo del cliente** (se indica en la ficha y en el
  mensaje; se acuerdan por privado).
- **Contenido digital**: lo entrega Nina a mano por MD.
- **Registrar venta** desde el panel: producto, cliente, importe, envío, método y
  nota. La pieza única pasa sola a Vendido. Así cada cliente acumula sus compras.

### "Me interesa"
Pasan dos cosas distintas al pulsar el botón:
1. **Mensaje del cliente a Nina**: se abre el chat privado de Nina con el texto
   ya escrito y el cliente solo pulsa enviar. Se genera en el momento a partir
   del producto pulsado con una **plantilla editable**. Ejemplo:
   `¡Hola Nina! 😊 Me interesa tu {producto} ({talla} · {color}) de {precio}. ¿Sigue disponible?`
2. **Aviso del bot a Nina**: el bot escribe a Nina
   `🔔 @juan quiere Tanga rosa · 19 € (precio VIP) · VIP: sí · Compras: 3`
   con botones *Abrir chat* y *Ver en el panel*. Plantilla editable.

El interés queda guardado en el panel aunque el cliente no llegue a enviar el
mensaje.

### Canal y comunicación
- **Novedades de la tienda en el canal**: las publicáis vosotros a mano, para no
  mezclar interacciones con otros grupos. El bot **solo actúa** en chats privados y
  en el canal VIP configurado; cualquier otro grupo o canal lo ignora.
- **Envíos masivos**: módulo opcional, **desactivado por defecto**, activable
  desde el panel.
- Sin campañas de recuperación por ahora.

### Panel
- Un único panel con interruptor **VIP Guard ⇄ Tienda** y modo claro/oscuro.
- **VIP Guard**: Resumen · Miembros · Clientes (CRM) · Pagos · Planes y precios ·
  Textos del bot · Canal (mantenimiento) · Alertas e historial · Exportar.
- **Tienda**: Resumen · Productos · Categorías · Ofertas · Ventas · Intereses ·
  Plantillas de mensajes · Apariencia · Exportar.
- **CRM**: ficha única por cliente con VIP (estado, días que le quedan,
  historial), pagos, compras, total gastado, intereses, notas y etiquetas.
  Incluye ranking de mejores clientes.
- **Todo texto visible es editable**: mensajes del bot, textos de la MiniApp y
  plantillas, con variables (`{nombre}`, `{dias_restantes}`, `{fecha_fin}`,
  `{precio}`…), vista previa y "restaurar texto original".
- **Sin backups de pago**: exportación a **Excel** (miembros, pagos, ventas,
  clientes, intereses) e **informe mensual en PDF**. Ojo: exportar sirve para
  llevar las cuentas, pero no permite restaurar la app si se pierde la base de
  datos.

## 3. Arquitectura técnica

Una sola app Next.js bien separada por módulos (no microservicios: a esta
escala serían más caros, lentos y frágiles), con Supabase como base de datos.

```
app/
  (miniapp)/          MiniApp pública
  admin/vip/          Panel VIP Guard
  admin/tienda/       Panel Tienda
  api/telegram/       webhook
  api/cron/tick       programador (cada minuto)
modules/
  vip/                suscripciones, pagos, planes, canal, avisos
  shop/               productos, precios, ofertas, ventas, intereses
  crm/                clientes y estadísticas
  texts/              textos editables y plantillas con variables
  telegram/           cliente API, bot, cola de mensajes
  core/               auth, env, seguridad, logs, exportaciones
```

### Orquestación
- **Programador cada minuto**: `pg_cron` + `pg_net` en Supabase llaman a
  `POST /api/cron/tick` (gratis y sin depender del plan de Vercel). Cada tick,
  con bloqueo para no solaparse:
  1. caduca y expulsa las suscripciones con `ends_at <= now()`;
  2. encola los avisos que toquen;
  3. vacía la cola de mensajes por lotes;
  4. quita las ofertas vencidas y oculta los "vendido" pasados de fecha.
- **Cola de mensajes (outbox)**: todo mensaje del bot pasa por una tabla con
  clave de deduplicación, reintentos con espera creciente y respeto de los
  límites de Telegram (429). Ningún aviso se pierde ni se envía dos veces.
- **Webhook idempotente**: se conserva el sistema actual de reclamar
  `update_id`.
- **Dinero en céntimos** (enteros) en toda la base de datos.
- **Historial inmutable**: pagos, ventas e intereses nunca se borran en cascada.

### Qué se conserva del código actual
Validación de `initData`, webhook idempotente, rate limit, sesiones admin
revocables, subida y optimización de imágenes, cabeceras de seguridad y tests de
infraestructura. El resto de dominio y UI se reescribe.

### Qué se elimina
Referidos, `payment_intents`, `scheduled_messages`, `creators`, planes fijos en
código, textos escritos en el código, fixtures de marketplace y documentos
históricos.

## 4. Base de datos (esquema v2)

No hay datos en producción, así que las migraciones se **consolidan en un
esquema limpio** en lugar de añadir parches encima.

| Tabla | Contenido |
|---|---|
| `customers` | Identidad Telegram, notas, etiquetas, fechas de alta y última actividad |
| `vip_channel` | Configuración del canal (fila única): chat id, autoexpulsión, novedades, envíos masivos |
| `vip_plans` | Nombre, días, precio alta, precio renovación, estado, orden |
| `subscriptions` | Una por cliente: `ends_at`, estado, datos de expulsión |
| `vip_payments` | Pago: plan, tipo alta/renovación, importe, método, días sumados, fecha anterior y nueva |
| `shop_categories` | Categorías con imagen y orden |
| `shop_products` | Producto completo con oferta, precio VIP, talla, color, pieza única, físico/digital, estados |
| `shop_product_images` | Galería |
| `shop_sales` | Ventas: producto, cliente, importe, envío, método |
| `shop_interests` | Clics en "Me interesa" con snapshot de producto y precio |
| `texts` | Textos editables: clave, texto, texto original, variables permitidas |
| `settings` | Ajustes (descuento VIP, avisos, interruptores) |
| `message_outbox` | Cola de mensajes del bot |
| `activity_log` | Historial unificado de acciones admin y eventos del bot |
| `admin_sessions`, `rate_limit_buckets`, `processed_telegram_updates`, `job_locks` | Infraestructura |
| vista `customer_stats` | Total gastado VIP + tienda, nº de compras, última compra |

Además:
- índice `pg_trgm` para la búsqueda de clientes;
- `set search_path` en todas las funciones;
- limpieza automática de logs, sesiones y buckets antiguos con `pg_cron`;
- ningún índice duplicado.

## 5. Fases

| Fase | Contenido | Estado |
|---|---|---|
| 0 | Git, Next.js 15.5.26 y dependencias (0 vulnerabilidades), este plan | ✅ |
| 1 | Esquema v2 consolidado + pruebas SQL | ✅ |
| 2 | Motor: módulos, cola de mensajes, programador cada minuto, solicitudes de unión, expulsión exacta, avisos | ✅ |
| 3 | Bot reescrito con textos editables, botón de tienda, adaptado a canal | ✅ |
| 4 | Panel unificado (VIP ⇄ Tienda, claro/oscuro, móvil) + CRM | ✅ |
| 5 | Panel Tienda: productos, fotos, ofertas, precio VIP, ventas, intereses, plantillas, ajustes | ✅ |
| 6 | MiniApp nueva: escaparate, fichas, ofertas, precio VIP, pestaña VIP | ✅ |
| 7 | Excel/PDF, pruebas (unitarias, SQL, entorno local completo), documentación | ✅ |

Pendiente para después, fuera del alcance acordado: campañas de recuperación
(«vuelve con un 10 %») y login con código por Telegram.

## 6. Pendiente de Nina/Chosky antes de desplegar

- Crear el bot en BotFather (o confirmar el existente) y el canal privado.
- Cuentas de Vercel y Supabase (plan gratuito).
- El @usuario de Telegram de Nina, que se configura en el panel, no en el código.
