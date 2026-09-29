import type { ReactNode } from "react";
import { cn } from "./cn";

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

export function Badge({ tone = "neutral", children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
        {
          neutral: "bg-subtle text-muted",
          accent: "bg-accent-soft text-accent",
          success: "bg-success/10 text-success",
          warning: "bg-warning/10 text-warning",
          danger: "bg-danger/10 text-danger",
          info: "bg-info/10 text-info",
        }[tone],
        className,
      )}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}
