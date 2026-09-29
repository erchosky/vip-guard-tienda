# VIP Guard + Tienda

Un canal VIP de pago en Telegram, un escaparate dentro de Telegram y **un único panel de control** para gestionarlo todo sin tocar código.

| Pieza | Quién la usa | Qué hace |
|---|---|---|
| **Bot** | Clientes | `/start`, ver planes, pedir un plan, recibir el acceso, avisos antes de caducar, entrar al canal |
| **Panel VIP Guard** | Vosotros | Miembros, pagos, planes y precios, textos del bot, canal, alertas, difusión opcional |
| **MiniApp Tienda** | Cualquiera que abra el bot | Escaparate con fotos, ofertas con cuenta atrás, precio VIP y botón «Me interesa» |
| **Panel Tienda** | Vosotros | Productos, fotos, precios, ofertas, ventas, intereses, textos, marca |

Los dos paneles son el mismo: en la cabecera hay un interruptor **VIP Guard ⇄ Tienda**, junto al de modo claro/oscuro.

**No hay pasarela de pagos.** Se cobra por Bizum o PayPal y el pago se registra en el panel con un botón, que suma los días y hace que el bot mande el acceso.

➡️ **Para publicarla por primera vez, sigue [docs/PUESTA_EN_MARCHA.md](docs/PUESTA_EN_MARCHA.md).**

---

## Cómo funciona

### Un cliente entra al VIP
1. Abre el bot y pulsa **Iniciar**. Ve la bienvenida y los botones **🛍️ Ver tienda**, **👑 VIP** y **ℹ️ Ayuda**.
2. En **VIP** ve los planes con su precio: de **alta** si es su primera vez y de **renovación** si ya fue VIP.
3. Elige uno y se abre **tu chat** con un mensaje ya escrito, del tipo *«¡Hola Nina! Quiero el plan VIP 1 mes (25 €)»*. A ti te llega además un aviso del bot.
4. Te paga por Bizum o PayPal. Abres su ficha en el panel y pulsas **Registrar pago**: eliges plan y método, y el importe se rellena solo.
5. El bot le manda al momento **«✅ ¡Ya eres VIP!»** con el botón **Entrar al canal**.
6. El enlace del canal pide **solicitar unirse**, y el bot solo acepta a quien tiene VIP activo. Aunque el enlace se comparta, no sirve a quien no ha pagado.
7. Recibe un aviso antes de caducar, con la antelación que elijas, con botones para renovar.
8. **A la hora exacta** en que termina, el bot le saca del canal (con un margen de 1 minuto) y le manda la oferta para volver.

Renovar **suma los días** a los que le quedan. Si ya había caducado, cuentan desde ese momento.

### Un cliente quiere algo de la tienda
1. Abre la tienda desde el botón del bot.
2. Ve los productos por categorías, con ofertas (precio tachado y «Termina en…»), etiquetas como RESERVADO, VENDIDO o Pieza única, y su **precio VIP** si lo es. Si no es VIP ve *«👑 VIP: 18 € · Hazte VIP»*.
3. Pulsa **Me interesa** y se abre tu chat con el mensaje ya escrito **con los datos de ese producto**: *«¡Hola Nina! 😊 Me interesa tu Tanga rosa (talla S) en Rosa de 19 €. ¿Sigue disponible?»*. Nunca puede salir otro producto.
4. A ti te llega un aviso del bot con quién es, si es VIP y cuántas compras lleva. El interés queda guardado en **Tienda → Intereses**.
5. Cuando cerráis la venta, la registras en **Ventas**. Si es pieza única, pasa sola a **VENDIDO**, se ve así unos días y luego desaparece.

### Todo es editable desde el panel
- **Textos del bot** y **Textos de la tienda**: cada mensaje con variables (`{nombre}`, `{dias_restantes}`, `{producto}`…), vista previa y botón para restaurar el original.
- **Planes**: duración, precio de alta y precio de renovación.
- **Descuento VIP general**, precio VIP por producto y días que se ve el sello VENDIDO.
- **Canal y bot**: conectar el bot, elegir el canal, autoexpulsión, avisos, tu Telegram para recibir avisos y el programador.

### Clientes (CRM)
Cada persona tiene una ficha con su VIP (días restantes e historial), pagos, compras, total gastado, intereses, notas y etiquetas. Hay un ranking por gasto y exportación a **Excel**. En **Informes** tienes el resumen del mes, que se puede guardar como **PDF**.

---

## Estructura técnica

```
app/                    Páginas y API (Next.js 15, App Router)
  (miniapp)/            La tienda que se abre dentro de Telegram
  admin/(panel)/vip     Panel VIP Guard
  admin/(panel)/tienda  Panel Tienda
  admin/(panel)/clientes, informes
  api/telegram/webhook  Bot
  api/cron/tick         Programador (cada minuto)
  api/shop/*            API de la MiniApp (autenticada con initData de Telegram)
  api/admin/*           Subida de fotos, buscador de clientes, exportaciones
modules/                Lógica de negocio, separada por dominio
  core/ auth/ texts/ settings/ telegram/ customers/ vip/ shop/ admin/ exports/
components/             Interfaz (ui/, admin/, miniapp/)
supabase/migrations/    Esquema de base de datos
supabase/tests/         Pruebas SQL
scripts/                Entorno local, pruebas SQL, ZIP limpio
```

Más detalle en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md). Las decisiones de producto están en [docs/REWORK_PLAN.md](docs/REWORK_PLAN.md).

## Comandos

```bash
npm ci                 # instalar
npm run check          # lint + tipos + tests + pruebas SQL + build (todo)
npm test               # tests unitarios
npm run test:sql       # prueba la base de datos en un Postgres temporal
npm run local:stack    # entorno local completo (Postgres + Supabase y Telegram simulados)
npm run local:dev      # la app contra ese entorno → http://localhost:3000
npm run zip:clean      # ZIP limpio para compartir (solo archivos de git)
```

Para el entorno local hacen falta Node 22, `postgresql@16` y `postgrest` de Homebrew. La contraseña del panel local es `local-admin-1234`, y la tienda se abre en el navegador con una usuaria de prueba.
