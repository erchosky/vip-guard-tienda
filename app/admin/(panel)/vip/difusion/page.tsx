import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { BroadcastForm } from "@/components/admin/broadcast-form";
import { db } from "@/modules/core/db";
import { formatShort } from "@/modules/core/dates";
import { getSettings } from "@/modules/settings/repo";
import { sendBroadcastAction } from "../actions";

export const metadata: Metadata = { title: "Difusión" };
export const dynamic = "force-dynamic";

const SEGMENT_FILTER = { all: "all", vip: "active", ex_vip: "expired", buyers: "buyers", no_vip: "no_vip" } as const;

export default async function BroadcastPage() {
  const features = await getSettings("features");
  if (!features.broadcasts) redirect("/admin/vip/canal#avisos");
  const counts: Record<string, number> = {};
  await Promise.all(Object.entries(SEGMENT_FILTER).map(async ([key, filter]) => {
    const { data } = await db().rpc("admin_customers", { p_filter: filter, p_limit: 1, p_offset: 0 });
    counts[key] = Number((data?.[0] as { total_count?: number } | undefined)?.total_count ?? 0);
  }));
  const history = await db().from("broadcasts").select("*").order("created_at", { ascending: false }).limit(20);
  return (
    <>
      <PageHeader title="Difusión" description="Manda un mensaje del bot a un grupo de clientes. Quien bloqueó el bot o está vetado no lo recibe." />
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Nuevo mensaje" />
          <CardBody><BroadcastForm action={sendBroadcastAction} counts={counts} /></CardBody>
        </Card>
        <Card className="h-fit lg:col-span-2">
          <CardHeader title="Enviados" />
          {history.data?.length ? (
            <ul className="divide-y divide-line">
              {history.data.map((b) => (
                <li key={b.id as string} className="px-4 py-3 text-sm sm:px-5">
                  <p className="line-clamp-2">{b.body as string}</p>
                  <p className="mt-0.5 text-xs text-muted">{formatShort(b.created_at as string)} · {b.recipients as number} personas</p>
                </li>
              ))}
            </ul>
          ) : <EmptyState title="Aún no has enviado ninguno" />}
        </Card>
      </div>
    </>
  );
}
