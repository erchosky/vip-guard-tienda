"use client";

import type { ReactNode } from "react";
import { ActionForm, type FormAction } from "@/components/ui/action-form";
import { Button, type ButtonVariant } from "@/components/ui/button";

/** Un botón que ejecuta una acción del servidor y enseña el resultado debajo. */
export function ActionButton({ action, children, variant = "primary", confirm, fields, pendingText, icon, size = "md" }: {
  action: FormAction;
  children: ReactNode;
  variant?: ButtonVariant;
  confirm?: string;
  fields?: Record<string, string>;
  pendingText?: string;
  icon?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <ActionForm action={action} confirm={confirm}>
      {Object.entries(fields ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <Button variant={variant} pendingText={pendingText} icon={icon} size={size}>{children}</Button>
    </ActionForm>
  );
}
