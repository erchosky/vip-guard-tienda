import type { Metadata } from "next";
import { CheckCircle2, CircleAlert, CircleX, Bot, Radio, BellRing, Timer } from "lucide-react";
import { PageHeader, KeyValue } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { ActionButton } from "@/components/admin/action-button";
import { AlertTogglesForm, ChannelRulesForm, ConnectChannelForm } from "@/components/admin/channel-forms";
import { formatDateTime, formatShort } from "@/modules/core/dates";
import { getManySettings } from "@/modules/settings/repo";
import { getChannel, type ChannelCheck } from "@/modules/vip/repo";
import { botStatus } from "@/modules/telegram/setup";
import { schedulerInfo } from "@/modules/admin/health";
import { db } from "@/modules/core/db";
import {
  alertTogglesAction, channelRulesAction, connectBotAction, connectChannelAction, createLinkCodeAction, enableSchedulerAction,
  refreshChannelAction, regenerateLinkAction, runTickAction, testAlertAction, unlinkAdminAction,
} from "../actions";

export const metadata: Metadata = { title: "Canal y bot" };
export const dynamic = "force-dynamic";

function Check({ ok, label, warn }: { ok: boolean | null; label: string; warn?: boolean }) {
  const Icon = ok ? CheckCircle2 : warn ? CircleAlert : CircleX;
  return (
    <li className="flex items-center gap-2 text-sm">
      <Icon className={ok ? "h-4 w-4 text-success" : warn ? "h-4 w-4 text-warning" : "h-4 w-4 text-danger"} />
      {label}
    </li>
  );
}

export default async function ChannelPage() {
  const [bot, channel, settings, scheduler, cron] = await Promise.all([
    botStatus(),
    getChannel(),
    getManySettings(["vip", "admin", "features", "detected_channels"] as const),
    schedulerInfo(),
    db().rpc("scheduler_status"),
  ]);
  const check = (channel.last_check && "ok" in channel.last_check ? channel.last_check : null) as ChannelCheck | null;
  const cronStatus = (cron.data ?? {}) as { available?: boolean; jobs?: Array<{ name: string; active: boolean }> };
  const tickScheduled = Boolean(cronStatus.jobs?.some((j) => j.name === "vip-tick" && j.active));
  const linkValid = settings.admin.linkCode && settings.admin.linkCodeExpiresAt && new Date(settings.admin.linkCodeExpiresAt).getTime() > Date.now();

  return (
    <>
      <PageHeader title="Canal y bot" description="Mantenimiento: conexión del bot, canal VIP, reglas, avisos y programador." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={<span id="bot" className="flex items-center gap-2"><Bot className="h-4 w-4" />Bot</span>} actions={bot.webhookOk ? <Badge tone="success" dot>Conectado</Badge> : <Badge tone="danger" dot>Sin conectar</Badge>} />
          <CardBody className="space-y-4">
            <KeyValue items={[
              ["Bot", bot.username ? `@${bot.username}` : bot.error ?? "—"],
              ["Mensajes en cola en Telegram", String(bot.pending)],
              ["Último error de Telegram", bot.lastError ? `${bot.lastError} (${formatShort(bot.lastErrorAt)})` : "Ninguno"],
              ["Dirección", bot.webhookUrl ?? "—"],
            ]} />
            <p className="text-[13px] text-muted">«Conectar» configura el webhook con su clave secreta, los comandos /start /vip /ayuda y el botón de menú que abre la tienda. Púlsalo tras publicar la app o si algo falla.</p>
            <div className="flex flex-wrap gap-2">
              <ActionButton action={connectBotAction} pendingText="Conectando…">{bot.webhookOk ? "Volver a conectar" : "Conectar bot"}</ActionButton>
              {bot.username ? <LinkButton href={`https://t.me/${bot.username}`} external variant="secondary">Abrir el bot</LinkButton> : null}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={<span id="canal" className="flex items-center gap-2"><Radio className="h-4 w-4" />Canal VIP</span>} actions={check?.ok ? <Badge tone="success" dot>Listo</Badge> : channel.telegram_chat_id ? <Badge tone="warning" dot>Revisar</Badge> : <Badge tone="danger" dot>Sin canal</Badge>} />
          <CardBody className="space-y-4">
            {channel.telegram_chat_id ? (
              <>
                <KeyValue items={[["Canal", channel.title ?? "—"], ["ID", String(channel.telegram_chat_id)], ["Comprobado", formatDateTime(channel.last_checked_at)]]} />
                <ul className="space-y-1.5">
                  <Check ok={check?.found ?? false} label="El bot ve el canal" />
                  <Check ok={check?.botAdmin ?? false} label="El bot es administrador" />
                  <Check ok={check?.canInvite ?? false} label="Puede añadir miembros (aceptar solicitudes)" />
                  <Check ok={check?.canRestrict ?? false} label="Puede expulsar usuarios" />
                  <Check ok={check?.protectedContent ?? null} warn label={check?.protectedContent ? "Contenido protegido (no se puede reenviar ni guardar)" : "Activa «Restringir guardado de contenido» en los ajustes del canal"} />
                  <Check ok={check?.isChannel ?? false} warn label={check?.isChannel ? "Es un canal" : "No es un canal (¿es un grupo?)"} />
                </ul>
                {check?.error ? <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{check.error}</p> : null}
                <ActionButton action={refreshChannelAction} variant="secondary" pendingText="Comprobando…">Comprobar de nuevo</ActionButton>
                <div className="rounded-xl bg-subtle p-3">
                  <p className="text-sm font-medium">Enlace de acceso al canal</p>
                  <p className="mb-2 text-[13px] text-muted">Pide «solicitar unirse»: el bot solo acepta a quien tiene VIP activo. Aunque se comparta, no sirve a quien no ha pagado.</p>
                  {channel.invite_link ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="truncate rounded bg-surface px-2 py-1 text-xs">{channel.invite_link}</code>
                      <CopyButton value={channel.invite_link} />
                      <ActionButton action={regenerateLinkAction} variant="ghost" size="sm" confirm="El enlace actual dejará de funcionar. ¿Crear uno nuevo?">Regenerar</ActionButton>
                    </div>
                  ) : <ActionButton action={regenerateLinkAction} size="sm">Crear enlace</ActionButton>}
                </div>
              </>
            ) : (
              <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
                <li>En Telegram, abre tu canal privado → Administradores → Añadir administrador → busca tu bot.</li>
                <li>Dale permisos de <b className="text-fg">Añadir miembros</b> y <b className="text-fg">Expulsar usuarios</b>.</li>
                <li>Vuelve aquí y recarga: el canal aparecerá abajo para conectarlo con un toque.</li>
              </ol>
            )}
            {settings.detected_channels.list.filter((c) => c.id !== channel.telegram_chat_id).length ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">Canales donde el bot es administrador</p>
                {settings.detected_channels.list.filter((c) => c.id !== channel.telegram_chat_id).map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2">
                    <span className="min-w-0 text-sm"><span className="block truncate font-medium">{c.title}</span><span className="text-xs text-muted">{c.id}</span></span>
                    <ActionButton action={connectChannelAction} fields={{ chatId: String(c.id) }} size="sm" confirm={channel.telegram_chat_id ? "¿Cambiar el canal VIP por este? El actual dejará de gestionarse." : undefined}>Usar este</ActionButton>
                  </div>
                ))}
              </div>
            ) : null}
            <details className="text-sm">
              <summary className="cursor-pointer text-muted">Conectar escribiendo el ID a mano</summary>
              <div className="mt-2"><ConnectChannelForm action={connectChannelAction} defaultId={channel.telegram_chat_id ? String(channel.telegram_chat_id) : undefined} /></div>
            </details>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Reglas" description="Qué pasa cuando alguien caduca." />
          <CardBody>
            <ChannelRulesForm action={channelRulesAction} autoExpel={channel.auto_expel} remindersEnabled={channel.reminders_enabled} reminderHours={settings.vip.reminderHours} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={<span id="avisos" className="flex items-center gap-2"><BellRing className="h-4 w-4" />Tus avisos en Telegram</span>} actions={settings.admin.telegramId ? <Badge tone="success" dot>Vinculado</Badge> : <Badge tone="warning" dot>Sin vincular</Badge>} />
          <CardBody className="space-y-4">
            {settings.admin.telegramId ? (
              <>
                <p className="text-sm">Los avisos llegan a <b>{settings.admin.telegramName ?? `ID ${settings.admin.telegramId}`}</b>.</p>
                <div className="flex flex-wrap gap-2">
                  <ActionButton action={testAlertAction} variant="secondary" size="sm">Mandarme una prueba</ActionButton>
                  <ActionButton action={unlinkAdminAction} variant="ghost" size="sm" confirm="¿Dejar de recibir avisos?">Desvincular</ActionButton>
                </div>
              </>
            ) : linkValid && bot.username ? (
              <div className="space-y-2 text-sm">
                <p>Ábrelo <b>desde tu cuenta de Telegram</b> (la que recibirá los avisos) y pulsa «Iniciar»:</p>
                <LinkButton href={`https://t.me/${bot.username}?start=link_${settings.admin.linkCode}`} external>Abrir el bot y vincular</LinkButton>
                <p className="text-xs text-muted">O envía al bot: <code>/vincular {settings.admin.linkCode}</code> · caduca en 15 min. Después recarga esta página.</p>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted">Te avisará de cada «Me interesa», de quién quiere un plan y de problemas graves (por ejemplo, si el bot pierde permisos).</p>
                <ActionButton action={createLinkCodeAction}>Vincular mi Telegram</ActionButton>
              </>
            )}
            <div className="border-t border-line pt-4">
              <AlertTogglesForm action={alertTogglesAction} interestAlerts={settings.features.interestAlerts} planRequestAlerts={settings.features.planRequestAlerts} broadcasts={settings.features.broadcasts} />
            </div>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title={<span id="programador" className="flex items-center gap-2"><Timer className="h-4 w-4" />Programador</span>} actions={scheduler.healthy ? <Badge tone="success" dot>Funcionando</Badge> : <Badge tone="danger" dot>Parado</Badge>} />
          <CardBody className="space-y-4">
            <p className="text-sm text-muted">Revisa cada minuto: saca del canal a quien caduca, manda los avisos y reintenta los mensajes que no salieron. Además, Vercel lo lanza una vez al día como respaldo.</p>
            <KeyValue items={[
              ["Última ejecución correcta", scheduler.lastOkAt ? formatDateTime(scheduler.lastOkAt) : "Nunca"],
              ["Cada minuto (Supabase)", cronStatus.available === false ? "pg_cron no disponible" : tickScheduled ? "Activado" : "Sin activar"],
              ["Último resultado", scheduler.lastResult ? `${scheduler.lastResult.expired ?? 0} caducados · ${scheduler.lastResult.sent ?? 0} mensajes · ${scheduler.lastResult.ms ?? 0} ms` : "—"],
              ["Último error", scheduler.lastError ?? "Ninguno"],
            ]} />
            <div className="flex flex-wrap gap-2">
              <ActionButton action={enableSchedulerAction} pendingText="Activando…">{tickScheduled ? "Reactivar" : "Activar cada minuto"}</ActionButton>
              <ActionButton action={runTickAction} variant="secondary" pendingText="Ejecutando…">Ejecutar ahora</ActionButton>
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
