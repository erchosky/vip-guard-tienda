# Puesta en marcha paso a paso

Tiempo aproximado: 45 minutos. Solo hay que hacerlo una vez. Cuando termines, el panel te enseñará una lista con todo en verde.

Necesitas:
- una cuenta de **GitHub**, donde se guarda el código (repositorio privado);
- una cuenta de **Supabase**, que es la base de datos (el plan gratuito sirve);
- una cuenta de **Vercel**, que publica la web (lee la nota sobre planes del paso 3);
- tu **Telegram** y el **canal privado** del VIP ya creado.

---

## 1. Crear el bot

1. En Telegram abre **@BotFather** y envía `/newbot`.
2. Ponle nombre y usuario (tiene que acabar en `bot`, por ejemplo `nina_vip_bot`).
3. BotFather te da un **token** del tipo `123456:ABC…`. Guárdalo: es la variable `TELEGRAM_BOT_TOKEN`. No lo compartas con nadie.
4. Opcional: `/setuserpic` para la foto del bot y `/setdescription` para el texto que se ve antes de pulsar Iniciar.

No hace falta configurar nada más en BotFather: el botón de la tienda, los comandos y el webhook los configura el panel con un botón.

## 2. Crear la base de datos (Supabase)

1. En [supabase.com](https://supabase.com) → **New project**. Elige región **EU (Frankfurt)** y una contraseña fuerte para la base de datos.
2. Cuando termine de crearse, ve a **SQL Editor → New query**, pega **entero** el contenido de `supabase/migrations/20260926000001_schema_v2.sql` y pulsa **Run**. Tiene que terminar sin errores.
   - Alternativa para quien use terminal: `npx supabase link` y después `npm run db:push`.
3. Ve a **Database → Extensions** y comprueba que están activadas **pg_cron** y **pg_net**. Si no lo están, actívalas: son las que hacen que el bot revise cada minuto.
4. Ve a **Project Settings → API** y copia:
   - **Project URL** → `SUPABASE_URL`
   - **service_role** (secret) → `SUPABASE_SERVICE_ROLE_KEY`. Esta clave **nunca** se pone en ningún otro sitio.

La migración crea también el almacén de fotos de la tienda (`shop-media`). En **Storage** debería aparecer.

## 3. Publicar la web (Vercel)

> **Nota sobre el plan de Vercel:** el plan gratuito (Hobby) de Vercel es solo para uso personal no comercial. Como esto es un negocio, lo correcto es el plan **Pro (unos 20 $/mes)**. Si preferís no pagarlo, la app funciona igual en otros servicios compatibles con Next.js (Netlify, Railway, Render…). El programador de cada minuto no depende de Vercel, porque lo lanza Supabase.

1. Sube el código a un repositorio **privado** de GitHub.
2. En [vercel.com](https://vercel.com) → **Add New → Project** → importa el repositorio.
3. Antes de pulsar Deploy, abre **Environment Variables** y añade las de `.env.example`:

| Variable | Qué poner |
|---|---|
| `NEXT_PUBLIC_APP_URL` | La dirección que te da Vercel, por ejemplo `https://nina-vip.vercel.app` (sin barra final). Si aún no la sabes, pon una provisional y cámbiala tras el primer deploy. |
| `SUPABASE_URL` | Paso 2 |
| `SUPABASE_SERVICE_ROLE_KEY` | Paso 2 |
| `TELEGRAM_BOT_TOKEN` | Paso 1 |
| `TELEGRAM_WEBHOOK_SECRET` | Una clave aleatoria de 16 o más letras y números |
| `ADMIN_PASSWORD` | La contraseña del panel (10 o más caracteres, que no uséis en otro sitio) |
| `SESSION_SECRET` | Otra clave aleatoria de 32 o más caracteres |
| `CRON_SECRET` | Otra clave aleatoria de 16 o más caracteres |

   Para generar claves aleatorias: en el Mac, abre Terminal y escribe `openssl rand -hex 24`.
4. Pulsa **Deploy**. Si cambiaste `NEXT_PUBLIC_APP_URL`, vuelve a desplegar (**Deployments → ⋯ → Redeploy**).

## 4. Configurarlo todo desde el panel

Entra en `https://tu-direccion/admin` con tu `ADMIN_PASSWORD`. En **VIP Guard → Resumen** verás la lista de puesta en marcha. Ve completándola:

1. **Canal y bot → Conectar bot.** Deja el bot conectado con su webhook, comandos y botón de tienda.
2. **Añade el bot a tu canal.** En Telegram: tu canal → Administradores → Añadir administrador → busca tu bot. Actívale **Añadir miembros** y **Expulsar usuarios**.
3. Recarga **Canal y bot**: el canal aparece en «Canales donde el bot es administrador». Pulsa **Usar este**. Se comprueban los permisos y se crea el enlace de acceso.
4. En los ajustes del canal en Telegram, activa **Restringir guardado de contenido**, para que no se pueda reenviar ni guardar. El panel te avisa si falta.
5. **Canal y bot → Programador → Activar cada minuto.**
6. **Canal y bot → Vincular mi Telegram.** Pulsa «Abrir el bot y vincular» **desde tu cuenta** y dale a Iniciar. A partir de ahí recibirás los avisos.
7. **Tienda → Ajustes**: tu nombre de marca, **tu @usuario de Telegram** (ahí llegan los mensajes «Me interesa»), el logo, el descuento VIP general y los días del sello VENDIDO.
8. **VIP Guard → Planes y precios**: crea tus planes, por ejemplo «1 mes · 30 días · alta 25 € · renovación 20 €».
9. **Tienda → Categorías** y después **Tienda → Productos → Nuevo producto**.
10. Revisa **Textos del bot** y **Textos de la tienda** y cambia lo que quieras.

## 5. Prueba completa con una cuenta secundaria

Usa otro Telegram (el de Chosky, por ejemplo) para probar todo como si fuera un cliente:

- [ ] Abrir el bot y pulsar Iniciar: sale la bienvenida con los botones.
- [ ] Pulsar **VIP** y elegir un plan: se abre tu chat con el mensaje escrito y te llega el aviso.
- [ ] En el panel, buscarle en **Miembros → Todos los clientes**, abrir su ficha y **Registrar pago**: le llega «¡Ya eres VIP!».
- [ ] Pulsar **Entrar al canal**: el bot acepta la solicitud solo.
- [ ] Abrir la tienda con **🛍️ Ver tienda**, entrar en un producto y pulsar **Me interesa**: se abre tu chat con el mensaje de ese producto y te llega el aviso.
- [ ] En su ficha, **Fijar fecha** para dentro de 3 minutos: en unos minutos sale del canal solo y le llega el mensaje de fin.
- [ ] Pedir entrar al canal otra vez sin VIP: el bot rechaza la solicitud y le manda los planes.

## Si algo falla

| Síntoma | Qué hacer |
|---|---|
| El bot no responde | **Canal y bot → Volver a conectar**. Si el aviso habla de https, revisa `NEXT_PUBLIC_APP_URL`. |
| A alguien no le llega el acceso | Seguramente no ha pulsado Iniciar en el bot o lo bloqueó. Su ficha lo indica. Usa **Copiar enlace del canal** y mándaselo tú. |
| No saca a la gente del canal | **Canal y bot → Comprobar de nuevo**: al bot le falta el permiso «Expulsar usuarios». Después, **Reintentar expulsión** en la ficha. |
| El programador sale «Parado» | Activa pg_cron y pg_net en Supabase y pulsa **Activar cada minuto**. Mientras tanto puedes pulsar **Ejecutar ahora**. |
| «Me interesa» dice que no hay contacto | Pon tu @usuario en **Tienda → Ajustes**. |
| Cambiar la contraseña del panel | Cambia `ADMIN_PASSWORD` en Vercel y vuelve a desplegar. Para cerrar las sesiones abiertas, cambia también `SESSION_SECRET`. |

## Copias de seguridad

El plan gratuito de Supabase no guarda copias descargables. En **Informes y Excel** puedes descargar clientes, pagos y ventas para llevar las cuentas. Ojo: esos archivos sirven para las cuentas, pero no para restaurar la app. Si algún día queréis copias de verdad, el plan Pro de Supabase las hace cada día.
