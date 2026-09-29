import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/misc";
import { TextsEditor } from "@/components/admin/texts-page";
import { restoreTextAction, saveTextAction } from "../../vip/actions";

export const metadata: Metadata = { title: "Textos de la tienda" };
export const dynamic = "force-dynamic";

export default function ShopTextsPage() {
  return (
    <>
      <PageHeader title="Textos de la tienda" description="Todo lo que se lee en la MiniApp y los mensajes que te envía el cliente al pulsar «Me interesa» o elegir un plan." />
      <TextsEditor section="tienda" saveAction={saveTextAction} restoreAction={restoreTextAction} />
    </>
  );
}
