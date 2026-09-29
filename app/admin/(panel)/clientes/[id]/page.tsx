import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, MessageCircle } from "lucide-react";
import { PageHeader, KeyValue, EmptyState, Stat } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Avatar, VipBadge, customerName, METHOD_LABEL, KIND_LABEL } from "@/components/admin/bits";
import { BanForm, DaysForm, EndDateForm, NotesForm, PaymentForm, RevokeForm, SimpleActionButton, VoidForm } from "@/components/admin/customer-forms";
import { db } from "@/modules/core/db";
import { AppError } from "@/modules/core/errors";
import { euros } from "@/modules/core/money";
import { dateToMadridLocal, formatDate, formatDateTime, formatHuman, formatShort, timeLeft } from "@/modules/core/dates";
import { getCustomer } from "@/modules/customers/repo";
import { getChannel, getSubscription, hasPaidBefore, listPlans } from "@/modules/vip/repo";
import { durationLabel, vipStatus } from "@/modules/vip/state";
import { INTEREST_STATUS_LABELS, type InterestStatus } from "@/modules/shop/interests";
import { adjustDaysAction, banAction, notesAction, registerPaymentAction, retryExpulsionAction, revokeAction, setEndDateAction, voidPaymentAction } from "../../vip/actions";
import { voidSaleAction } from "../../tienda/actions";

export const metadata: Metadata = { title: "Ficha de cliente" };
export const dynamic = "force-dynamic";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const customer = await getCustomer(id).catch((error) => {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  });

  const [sub, paid, plans, channel, payments, sales, interests, activity, stats, alerts] = await Promise.all([
    getSubscription(id),
    hasPaidBefore(id),
    listPlans({ includeHidden: true }),
    getChannel(),
    db().from("vip_payments").select("*").eq("customer_id", id).order("created_at", { ascending: false }).limit(50),
    db().from("shop_sales").select("*").eq("customer_id", id).order("sold_at", { ascending: false }).limit(50),
    db().from("shop_interests").select("*").eq("customer_id", id).order("last_clicked_at", { ascending: false }).limit(30),
    db().from("activity_log").select("at, actor, summary, level").eq("customer_id", id).order("at", { ascending: false }).limit(25),
    db().from("customer_stats").select("*").eq("customer_id", id).maybeSingle(),
    db().from("alerts").select("id, title, detail").eq("customer_id", id).eq("status", "open"),
  ]);
  const status = vipStatus(sub);
  const name = customerName(customer);
  const chat = customer.username ? `https://t.me/${customer.username}` : `tg://user?id=${customer.telegram_id}`;
  const s = (stats.data ?? {}) as { vip_paid_cents?: number; shop_spent_cents?: number; purchases_count?: number; total_spent_cents?: number };

  return (
    <>
      <PageHeader
        back={{ href: "/admin/vip/miembros", label: "Miembros" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <Avatar name={name} className="h-11 w-11 text-base" />
            <span>{name}</span>
            <VipBadge status={status} endsAt={sub?.ends_at ?? null} />
            {customer.is_banned ? <Badge tone="danger">Vetado</Badge> : null}
          </span>
        }
        description={`${customer.username ? `@${customer.username} · ` : ""}ID ${customer.telegram_id} · cliente desde ${formatDate(customer.created_at)}`}
        actions={<LinkButton href={chat} external variant="secondary" icon={<MessageCircle className="h-4 w-4" />}>Abrir chat</LinkButton>}
      />

      {alerts.data?.length ? (
        <div className="mb-5 space-y-2">
          {alerts.data.map((a) => (
            <div key={a.id as string} className="flex gap-2 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <div><p className="font-medium">{a.title as string}</p>{a.detail ? <p className="text-muted">{a.detail as string}</p> : null}</div>
            </div>
          ))}
        </div>
      ) : null}
      {!customer.started_bot_at || customer.bot_blocked_at ? (
        <div className="mb-5 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
          {customer.bot_blocked_at ? "Ha bloqueado el bot: no le llegarán avisos. Escríbele tú." : "Todavía no ha pulsado «Iniciar» en el bot, así que el bot no puede escribirle. Pídele que lo abra."}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Estado VIP" value={status === "active" ? timeLeft(sub!.ends_at) : status === "expired" ? "Caducado" : "Sin VIP"} hint={sub ? `${status === "active" ? "hasta" : "terminó"} el ${formatHuman(sub.ends_at)}` : undefined} tone={status === "active" ? "accent" : undefined} />
        <Stat label="Gastado en VIP" value={euros(s.vip_paid_cents)} />
        <Stat label="Gastado en tienda" value={euros(s.shop_spent_cents)} hint={`${s.purchases_count ?? 0} compras`} />
        <Stat label="Total" value={euros(s.total_spent_cents)} tone="success" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card>
            <CardHeader title={status === "active" ? "Renovar VIP" : paid ? "Volver a dar VIP" : "Dar de alta en el VIP"} description="Guarda el pago, suma los días y el bot le manda el acceso. Todo en un paso." />
            <CardBody>
              <PaymentForm
                key={`${paid}-${sub?.ends_at ?? "none"}`}
                action={registerPaymentAction}
                customerId={id}
                hasPaidBefore={paid}
                isActive={status === "active"}
                plans={plans.filter((p) => p.status !== "archived").map((p) => ({ id: p.id, name: p.name, durationLabel: durationLabel(p.duration_days), firstCents: p.price_first_cents, renewalCents: p.price_renewal_cents, status: p.status }))}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Historial VIP" description="Pagos, regalos y ajustes. Nada se borra: lo erróneo se anula." />
            {payments.data?.length ? (
              <ul className="divide-y divide-line">
                {payments.data.map((p) => (
                  <li key={p.id as string} className={`px-4 py-3 sm:px-5 ${p.voided_at ? "opacity-50" : ""}`}>
                    <div className="flex items-start gap-3">
                      <Badge tone={p.kind === "first" ? "accent" : p.kind === "renewal" ? "success" : "neutral"}>{KIND_LABEL[p.kind as string]}</Badge>
                      <p className="min-w-0 flex-1 text-sm">
                        {p.plan_name ? <span className="font-medium">{p.plan_name as string} · </span> : null}
                        {(p.days_added as number) > 0 ? "+" : ""}{p.days_added as number} días → hasta {formatShort(p.new_ends_at as string)}
                      </p>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">{(p.amount_cents as number) > 0 ? euros(p.amount_cents as number) : "—"}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center justify-between gap-2 pl-[4.5rem] text-xs text-muted">
                      <span>
                        {formatShort(p.created_at as string)}{p.method ? ` · ${METHOD_LABEL[p.method as string]}` : ""}
                        {p.note ? ` · ${p.note as string}` : ""}
                        {p.voided_at ? <span className="text-danger"> · Anulado{p.void_reason ? `: ${p.void_reason}` : ""}</span> : null}
                      </span>
                      {!p.voided_at && (p.kind === "first" || p.kind === "renewal") ? <VoidForm action={voidPaymentAction} idName="paymentId" id={p.id as string} /> : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : <EmptyState title="Sin movimientos todavía" />}
          </Card>

          <Card>
            <CardHeader title="Compras en la tienda" actions={<Link className="link text-sm" href={`/admin/tienda/ventas?cliente=${id}`}>Registrar venta</Link>} />
            {sales.data?.length ? (
              <ul className="divide-y divide-line">
                {sales.data.map((sale) => (
                  <li key={sale.id as string} className={`flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5 ${sale.voided_at ? "opacity-50" : ""}`}>
                    <span className="min-w-0 flex-1 text-sm">
                      {sale.product_id ? <Link className="font-medium hover:underline" href={`/admin/tienda/productos/${sale.product_id}`}>{sale.product_title as string}</Link> : <span className="font-medium">{sale.product_title as string}</span>}
                      <span className="block text-xs text-muted">{formatShort(sale.sold_at as string)} · {METHOD_LABEL[sale.method as string]}{(sale.shipping_cents as number) ? ` · envío ${euros(sale.shipping_cents as number)}` : ""}{sale.voided_at ? " · anulada" : ""}</span>
                    </span>
                    <span className="text-sm font-semibold tabular-nums">{euros(sale.amount_cents as number)}</span>
                    {!sale.voided_at ? <VoidForm action={voidSaleAction} idName="saleId" id={sale.id as string} /> : null}
                  </li>
                ))}
              </ul>
            ) : <EmptyState title="Todavía no ha comprado nada" />}
          </Card>

          <Card>
            <CardHeader title="Le ha interesado" />
            {interests.data?.length ? (
              <ul className="divide-y divide-line">
                {interests.data.map((i) => (
                  <li key={i.id as string} className="flex items-center gap-3 px-4 py-3 text-sm sm:px-5">
                    <span className="min-w-0 flex-1">
                      {i.product_id ? <Link className="font-medium hover:underline" href={`/admin/tienda/productos/${i.product_id}`}>{i.product_title as string}</Link> : i.product_title as string}
                      <span className="block text-xs text-muted">{formatShort(i.last_clicked_at as string)}{(i.clicks as number) > 1 ? ` · ${i.clicks} clics` : ""}{i.was_vip ? " · era VIP" : ""}</span>
                    </span>
                    {i.price_shown_cents !== null ? <span className="tabular-nums text-muted">{euros(i.price_shown_cents as number)}</span> : null}
                    <Badge tone={i.status === "new" ? "accent" : i.status === "sold" ? "success" : "neutral"}>{INTEREST_STATUS_LABELS[i.status as InterestStatus]}</Badge>
                  </li>
                ))}
              </ul>
            ) : <EmptyState title="Sin intereses" />}
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Ajustar días" />
            <CardBody className="space-y-5">
              <DaysForm action={adjustDaysAction} customerId={id} />
              <div className="border-t border-line pt-4">
                <EndDateForm action={setEndDateAction} customerId={id} current={dateToMadridLocal(sub?.ends_at ?? new Date(Date.now() + 30 * 86_400_000))} />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Canal" />
            <CardBody className="space-y-3 text-sm">
              <KeyValue items={[
                ["En el canal desde", sub?.joined_channel_at && !sub.left_channel_at ? formatDateTime(sub.joined_channel_at) : "No está dentro"],
                ["Última salida", sub?.left_channel_at ? formatDateTime(sub.left_channel_at) : "—"],
                ["Expulsión", sub ? ({ none: "—", pending: "Pendiente", done: `Hecha ${formatShort(sub.expelled_at)}`, failed: "Falló" } as Record<string, string>)[sub.expulsion_status] : "—"],
                ["Primera alta", sub ? formatDate(sub.started_at) : "—"],
              ]} />
              {sub?.last_expulsion_error ? <p className="rounded-lg bg-danger/10 px-3 py-2 text-danger">{sub.last_expulsion_error}</p> : null}
              <div className="flex flex-wrap gap-2">
                {channel.invite_link && status === "active" ? <CopyButton value={channel.invite_link} label="Copiar enlace del canal" /> : null}
                {sub && status !== "active" && sub.expulsion_status !== "done" && sub.expulsion_status !== "none" ? <SimpleActionButton action={retryExpulsionAction} fields={{ customerId: id }} label="Reintentar expulsión" /> : null}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Notas y etiquetas" />
            <CardBody><NotesForm action={notesAction} customerId={id} notes={customer.notes} tags={customer.tags} /></CardBody>
          </Card>

          <Card className="border-danger/30">
            <CardHeader title="Zona peligrosa" />
            <CardBody className="space-y-4">
              {status === "active" ? <RevokeForm action={revokeAction} customerId={id} /> : null}
              <BanForm action={banAction} customerId={id} banned={customer.is_banned} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Actividad" />
            {activity.data?.length ? (
              <ul className="divide-y divide-line">
                {activity.data.map((a, index) => (
                  <li key={index} className="px-4 py-2.5 text-[13px] sm:px-5">
                    <p className={a.level === "info" ? "" : "text-warning"}>{a.summary as string}</p>
                    <p className="text-xs text-muted">{formatShort(a.at as string)} · {a.actor as string}</p>
                  </li>
                ))}
              </ul>
            ) : <EmptyState title="Sin actividad" />}
          </Card>
        </div>
      </div>
    </>
  );
}
