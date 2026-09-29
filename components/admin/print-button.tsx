"use client";

import { Printer } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className={buttonStyles("primary", "md", "no-print")}>
      <Printer className="h-4 w-4" /> Guardar como PDF
    </button>
  );
}
