import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlanForm } from "@/components/admin/plan-form";
import { centsToInput, euros } from "@/modules/core/money";
import { listPlans } from "@/modules/vip/repo";
import { durationLabel } from "@/modules/vip/state";
import { savePlanAction } from "../actions";

export const metadata: Metadata = { title: "Planes y precios" };
export const dynamic = "force-dynamic";

export default async function PlansPage() {
  const plans = await listPlans({ includeHidden: true, includeArchived: true });
  return (
    <>
      <PageHeader title="Planes y precios" description="Lo que ven los clientes en el bot y en la tienda. Cambiar un precio no afecta a quien ya ha pagado." />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          {plans.length === 0 ? <p className="text-sm text-muted">Todavía no hay planes. Crea el primero a la derecha.</p> : null}
          {plans.map((plan) => (
            <details key={plan.id} className="card group overflow-hidden">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 sm:px-5">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 font-semibold">
                    {plan.name}
                    {plan.is_featured ? <Badge tone="accent">Destacado</Badge> : null}
                    {plan.status === "hidden" ? <Badge>Oculto</Badge> : null}
                    {plan.status === "archived" ? <Badge tone="danger">Archivado</Badge> : null}
                  </span>
                  <span className="text-[13px] text-muted">{durationLabel(plan.duration_days)} · alta {euros(plan.price_first_cents)} · renovación {euros(plan.price_renewal_cents)}</span>
                </span>
                <span className="text-sm text-accent group-open:hidden">Editar</span>
              </summary>
              <div className="border-t border-line px-4 py-4 sm:px-5">
                <PlanForm action={savePlanAction} submitLabel="Guardar cambios" plan={{ id: plan.id, name: plan.name, description: plan.description, duration_days: plan.duration_days, price_first: centsToInput(plan.price_first_cents), price_renewal: centsToInput(plan.price_renewal_cents), status: plan.status, is_featured: plan.is_featured, sort_order: plan.sort_order }} />
              </div>
            </details>
          ))}
        </div>
        <Card className="h-fit lg:col-span-2">
          <CardHeader title="Nuevo plan" />
          <CardBody><PlanForm action={savePlanAction} submitLabel="Crear plan" /></CardBody>
        </Card>
      </div>
    </>
  );
}
