"use client";

import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "neutral";

const variants: Record<BadgeVariant, string> = {
  default: "bg-tradeling-950/60 text-tradeling-400 border-tradeling-800",
  success: "bg-green-950/60 text-green-400 border-green-900",
  warning: "bg-yellow-950/60 text-yellow-400 border-yellow-900",
  danger: "bg-red-950/60 text-red-400 border-red-900",
  info: "bg-blue-950/60 text-blue-400 border-blue-900",
  neutral: "bg-buddy-bg text-buddy-muted border-buddy-border",
};

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
