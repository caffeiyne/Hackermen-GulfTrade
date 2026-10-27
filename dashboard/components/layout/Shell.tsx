"use client";

import { useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

interface ShellProps {
  children: React.ReactNode;
  emergencyAlerts?: React.ReactNode;
}

export function Shell({ children }: ShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = useCallback(() => setSidebarOpen((v) => !v), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar — always visible on md+ */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      {/* Mobile sidebar drawer */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
              onClick={closeSidebar}
            />
            {/* Drawer */}
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 350, damping: 35 }}
              className="fixed left-0 top-0 bottom-0 z-50 md:hidden"
            >
              <div className="relative h-full">
                <Sidebar onNavigate={closeSidebar} />
                <button
                  onClick={closeSidebar}
                  className="absolute top-4 right-3 p-1.5 rounded-lg hover:bg-buddy-bg text-buddy-muted hover:text-buddy-text transition-colors"
                  aria-label="Close menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main column */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <TopBar onToggleSidebar={toggleSidebar} />
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
