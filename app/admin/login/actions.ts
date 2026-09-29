"use server";

import { redirect } from "next/navigation";
import { login } from "@/modules/auth/session";
import type { ActionState } from "@/components/ui/action-form";

export async function loginAction(_: ActionState, form: FormData): Promise<ActionState> {
  let result: Awaited<ReturnType<typeof login>>;
  try {
    result = await login(form.get("password"));
  } catch (error) {
    console.error("login_failed", error);
    return { ok: false, error: "No se pudo iniciar sesión. Revisa la configuración del servidor.", at: Date.now() };
  }
  if (result === "rate_limited") return { ok: false, error: "Demasiados intentos. Espera 15 minutos.", at: Date.now() };
  if (result === "invalid") return { ok: false, error: "Contraseña incorrecta.", at: Date.now() };
  redirect("/admin");
}
