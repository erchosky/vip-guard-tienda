"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { buttonStyles, type ButtonVariant } from "./button";

export function CopyButton({ value, label = "Copiar", variant = "secondary" }: { value: string; label?: string; variant?: ButtonVariant }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={buttonStyles(variant, "sm")}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {
          window.prompt("Copia el texto:", value);
        }
      }}
    >
      {done ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {done ? "Copiado" : label}
    </button>
  );
}
