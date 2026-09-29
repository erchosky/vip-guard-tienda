import { Card, CardHeader } from "@/components/ui/card";
import { TextItem } from "@/components/admin/text-editor";
import { VARIABLE_HELP, textsBySection, type TextSection } from "@/modules/texts/catalog";
import { loadOverrides } from "@/modules/texts/repo";
import type { FormAction } from "@/components/ui/action-form";

export async function TextsEditor({ section, saveAction, restoreAction }: { section: TextSection; saveAction: FormAction; restoreAction: FormAction }) {
  const overrides = await loadOverrides(true);
  const groups = textsBySection(section);
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-line bg-surface px-4 py-3 text-[13px] text-muted">
        <b className="text-fg">Cómo funciona:</b> pulsa una variable (como <code className="rounded bg-subtle px-1">{"{nombre}"}</code>) para meterla en el texto y se rellenará sola. Lo que pongas <b className="text-fg">[entre corchetes]</b> solo aparece si esa variable tiene datos. Los emojis funcionan. Los cambios se aplican al momento.
      </div>
      {groups.map(({ group, items }) => (
        <Card key={group} className="overflow-hidden">
          <CardHeader title={group} />
          {items.map((item) => (
            <TextItem
              key={item.key}
              saveAction={saveAction}
              restoreAction={restoreAction}
              varHelp={VARIABLE_HELP}
              text={{ key: item.key, label: item.label, help: item.help, vars: item.vars, short: item.short, original: item.default, value: overrides.get(item.key) ?? item.default, edited: overrides.has(item.key) }}
            />
          ))}
        </Card>
      ))}
    </div>
  );
}
