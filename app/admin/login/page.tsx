import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Lock } from "lucide-react";
import { ActionForm } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { loginAction } from "./actions";

export const metadata: Metadata = { title: "Entrar al panel" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const theme = (await cookies()).get("admin_theme")?.value ?? "system";
  return (
    <div data-theme={theme} className="grid min-h-dvh place-items-center bg-canvas px-4 py-10 text-fg">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-accent text-accent-fg shadow-pop">
            <Lock className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-semibold">Panel de control</h1>
          <p className="mt-1 text-sm text-muted">VIP Guard y Tienda</p>
        </div>
        <div className="card p-5">
          <ActionForm action={loginAction}>
            <label className="label" htmlFor="password">Contraseña</label>
            <input id="password" name="password" type="password" required autoFocus autoComplete="current-password" className="input" />
            <Button className="mt-4 w-full" size="lg" pendingText="Entrando…">Entrar</Button>
          </ActionForm>
        </div>
        <p className="mt-4 text-center text-xs text-muted">La sesión dura 30 días en este dispositivo.</p>
      </div>
    </div>
  );
}
