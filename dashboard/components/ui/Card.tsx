"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  delay?: number;
}

export function Card({ children, className, hover = false, delay = 0 }: CardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: "easeOut" }}
      whileHover={hover ? { y: -2, transition: { duration: 0.2 } } : undefined}
      className={cn(
        "rounded-xl border border-buddy-border bg-buddy-surface p-4 sm:p-5",
        hover && "hover:border-tradeling-800 transition-colors cursor-pointer",
        className
      )}
    >
      {children}
    </motion.div>
  );
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mb-4", className)}>{children}</div>;
}

export function CardTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h3 className={cn("text-sm font-medium text-buddy-muted", className)}>{children}</h3>;
}

export function CardValue({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-2xl font-bold text-buddy-text", className)}>{children}</p>;
}
