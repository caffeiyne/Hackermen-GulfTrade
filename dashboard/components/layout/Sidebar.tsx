"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Package,
  TrendingUp,
  AlertTriangle,
  ArrowRightLeft,
  Clock,
  PlayCircle,
  Boxes,
  BarChart3,
  ClipboardCheck,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard", label: "Inventory Map", icon: Boxes },
  { href: "/warehouse-stock", label: "Warehouse Stock", icon: Layers },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/forecast", label: "Forecast", icon: TrendingUp },
  { href: "/imbalances", label: "Imbalances", icon: AlertTriangle },
  { href: "/actions", label: "Actions", icon: ArrowRightLeft },
  { href: "/action-log", label: "Action Summary", icon: ClipboardCheck },
  { href: "/timeline", label: "Timeline", icon: Clock },
  { href: "/simulator", label: "Simulator", icon: PlayCircle },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 shrink-0 border-r border-buddy-border bg-buddy-surface flex flex-col">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 h-16 border-b border-buddy-border">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-tradeling-400 to-tradeling-600 flex items-center justify-center">
          <Package className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-sm font-bold text-buddy-text">GulfTrade</p>
          <p className="text-xs text-buddy-muted">Intelligence</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors relative",
                active
                  ? "text-tradeling-400 bg-tradeling-950/40"
                  : "text-buddy-muted hover:text-buddy-text hover:bg-buddy-bg"
              )}
            >
              {active && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-tradeling-400"
                  transition={{ type: "spring", stiffness: 350, damping: 30 }}
                />
              )}
              <Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-buddy-border">
        <p className="text-xs text-buddy-muted">
          <span className="inline-block w-2 h-2 rounded-full bg-tradeling-400 mr-2 animate-pulse" />
          Hackathon Prototype
        </p>
      </div>
    </aside>
  );
}
