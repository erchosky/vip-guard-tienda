"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "./cn";

export type ActionState = { ok?: boolean; message?: string; error?: string; at?: number };
export type FormAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Formulario conectado a una Server Action: muestra el error debajo sin perder
 * lo escrito y un aviso verde al guardar. Si `confirm` está puesto, pide
 * confirmación antes de enviar.
 */
export function ActionForm({
  action,
  children,
  className,
  confirm,
  resetOnSuccess,
  onSuccess,
  id,
}: {
  action: FormAction;
  children: ReactNode;
  className?: string;
  confirm?: string;
  resetOnSuccess?: boolean;
  onSuccess?: () => void;
  id?: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const formRef = useRef<HTMLFormElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!state.at) return;
    setVisible(true);
    if (state.ok) {
      if (resetOnSuccess) formRef.current?.reset();
      onSuccess?.();
      const timer = setTimeout(() => setVisible(false), 3500);
      return () => clearTimeout(timer);
    }
  }, [state.at, state.ok, resetOnSuccess, onSuccess]);

  return (
    <form
      id={id}
      ref={formRef}
      action={formAction}
      className={className}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
    >
      {children}
      {visible && state.at ? (
        <div
          role="status"
          className={cn(
            "mt-3 flex animate-fade-in items-start gap-2 rounded-lg px-3 py-2.5 text-sm",
            state.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger",
          )}
        >
          {state.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{state.ok ? state.message : state.error}</span>
        </div>
      ) : null}
    </form>
  );
}
