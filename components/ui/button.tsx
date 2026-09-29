"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "soft";
export type ButtonSize = "sm" | "md" | "lg";

export const buttonStyles = (variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) =>
  cn(
    "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition active:scale-[.98] disabled:pointer-events-none disabled:opacity-50",
    {
      primary: "bg-accent text-accent-fg shadow-sm hover:brightness-105",
      secondary: "border border-line bg-surface text-fg shadow-sm hover:bg-subtle",
      soft: "bg-accent-soft text-accent hover:brightness-95",
      ghost: "text-muted hover:bg-subtle hover:text-fg",
      danger: "bg-danger/10 text-danger hover:bg-danger/15",
    }[variant],
    { sm: "h-8 px-3 text-[13px]", md: "h-10 px-4 text-sm", lg: "h-12 px-5 text-[15px]" }[size],
    className,
  );

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  pendingText?: string;
  icon?: ReactNode;
};

/** Botón que se bloquea y muestra "Guardando…" mientras su formulario se envía. */
export function Button({ variant, size, className, children, pendingText, icon, disabled, type = "submit", ...props }: Props) {
  const { pending } = useFormStatus();
  const busy = pending && type === "submit";
  return (
    <button type={type} disabled={disabled || busy} className={buttonStyles(variant, size, className)} {...props}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {busy && pendingText ? pendingText : children}
    </button>
  );
}

export function LinkButton({ href, variant, size, className, children, icon, external, download }: { href: string; variant?: ButtonVariant; size?: ButtonSize; className?: string; children: ReactNode; icon?: ReactNode; external?: boolean; download?: boolean }) {
  if (download) {
    return (
      <a href={href} download className={buttonStyles(variant, size, className)}>
        {icon}
        {children}
      </a>
    );
  }
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={buttonStyles(variant, size, className)}>
        {icon}
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={buttonStyles(variant, size, className)}>
      {icon}
      {children}
    </Link>
  );
}
