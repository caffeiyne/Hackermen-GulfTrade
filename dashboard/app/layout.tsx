import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";

// Client-only: the emergency alert system uses WebSocket + browser APIs,
// so we skip SSR to avoid "useContext is null" during server rendering.
const EmergencyAlertSystem = dynamic(
  () => import("@/components/EmergencyAlertSystem").then((m) => m.EmergencyAlertSystem),
  { ssr: false }
);

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: "GulfTrade Intelligence — Inventory & Demand Planner",
  description: "AI-based demand planning and stock distribution agent for B2B inventory management",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${jetbrains.variable} font-sans`}>
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <div className="flex flex-1 flex-col overflow-hidden">
            <TopBar />
            <EmergencyAlertSystem />
            <main className="flex-1 overflow-y-auto p-6">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
