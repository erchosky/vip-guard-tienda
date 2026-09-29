import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/misc";
import { TextsEditor } from "@/components/admin/texts-page";
import { restoreTextAction, saveTextAction } from "../actions";

export const metadata: Metadata = { title: "Textos del bot" };
export const dynamic = "force-dynamic";

export default function BotTextsPage() {
  return (
    <>
      <PageHeader title="Textos del bot" description="Todo lo que dice el bot a tus clientes y los avisos que te manda a ti." />
      <TextsEditor section="vip" saveAction={saveTextAction} restoreAction={restoreTextAction} />
    </>
  );
}
