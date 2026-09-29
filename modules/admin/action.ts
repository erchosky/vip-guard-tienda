import "server-only";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requireAdminAction } from "@/modules/auth/session";
import { publicMessage } from "@/modules/core/errors";
import type { ActionState } from "@/components/ui/action-form";

/**
 * Envoltorio de todas las acciones del panel: comprueba sesión, origen y ritmo,
 * convierte cualquier error en un mensaje legible y refresca el panel.
 */
export async function adminAction(fn: () => Promise<string | void>): Promise<ActionState> {
  try {
    await requireAdminAction();
    const message = await fn();
    revalidatePath("/admin", "layout");
    return { ok: true, message: message || "Guardado ✓", at: Date.now() };
  } catch (error) {
    unstable_rethrow(error);
    if (!(error instanceof Error) || error.name !== "AppError") console.error("[admin action]", error);
    return { ok: false, error: publicMessage(error), at: Date.now() };
  }
}
