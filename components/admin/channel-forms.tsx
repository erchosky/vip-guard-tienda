"use client";

import { ActionForm, type FormAction } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Input, Switch } from "@/components/ui/field";

const HOURS = [
  { value: 168, label: "1 semana" },
  { value: 72, label: "3 días" },
  { value: 48, label: "2 días" },
  { value: 24, label: "1 día" },
  { value: 12, label: "12 horas" },
  { value: 3, label: "3 horas" },
  { value: 1, label: "1 hora" },
];

export function ChannelRulesForm({ action, autoExpel, remindersEnabled, reminderHours }: { action: FormAction; autoExpel: boolean; remindersEnabled: boolean; reminderHours: number[] }) {
  return (
    <ActionForm action={action} className="space-y-4">
      <Switch name="auto_expel" defaultChecked={autoExpel} label="Expulsar automáticamente al caducar" description="A la hora exacta en que termina su VIP (con un margen de 1 minuto). Si lo desactivas, solo te avisa y le echas tú." />
      <Switch name="reminders_enabled" defaultChecked={remindersEnabled} label="Avisar antes de que caduque" description="El bot le escribe con el botón para renovar." />
      <div>
        <p className="label">¿Con cuánta antelación?</p>
        <div className="flex flex-wrap gap-2">
          {HOURS.map((h) => (
            <label key={h.value} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
              <input type="checkbox" name="reminderHours" value={h.value} defaultChecked={reminderHours.includes(h.value)} className="accent-[rgb(var(--c-accent))]" />
              {h.label}
            </label>
          ))}
        </div>
        <p className="hint">Puedes marcar varios (máximo 5). Cada aviso se manda una sola vez.</p>
      </div>
      <Button>Guardar reglas</Button>
    </ActionForm>
  );
}

export function ConnectChannelForm({ action, defaultId }: { action: FormAction; defaultId?: string }) {
  return (
    <ActionForm action={action} className="flex flex-wrap items-end gap-2">
      <div className="min-w-[220px] flex-1">
        <label className="label" htmlFor="chatId">ID del canal</label>
        <Input id="chatId" name="chatId" defaultValue={defaultId} placeholder="-1001234567890" inputMode="numeric" />
      </div>
      <Button>Conectar</Button>
    </ActionForm>
  );
}

export function AlertTogglesForm({ action, interestAlerts, planRequestAlerts, broadcasts }: { action: FormAction; interestAlerts: boolean; planRequestAlerts: boolean; broadcasts: boolean }) {
  return (
    <ActionForm action={action} className="space-y-3">
      <Switch name="interestAlerts" defaultChecked={interestAlerts} label="Avisarme de cada «Me interesa»" />
      <Switch name="planRequestAlerts" defaultChecked={planRequestAlerts} label="Avisarme cuando alguien quiere un plan VIP" />
      <Switch name="broadcasts" defaultChecked={broadcasts} label="Activar la sección «Difusión»" description="Para mandar un mensaje a todos (o a un grupo) desde el panel. Desactivado por defecto." />
      <Button variant="secondary">Guardar</Button>
    </ActionForm>
  );
}
