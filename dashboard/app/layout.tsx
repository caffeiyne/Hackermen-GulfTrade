import type { Metadata, Viewport } from "next";
import dynamic from "next/dynamic";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Shell } from "@/components/layout/Shell";

// Client-only: the emergency alert system uses WebSocket + browser APIs,
// so we skip SSR to avoid "useContext is null" during server rendering.
const EmergencyAlertSystem = dynamic(
  () => import("@/components/EmergencyAlertSystem").then((m) => m.EmergencyAlertSystem),
  { ssr: false }
);

const IntroOverlay = dynamic(
  () => import("@/components/IntroOverlay").then((m) => m.IntroOverlay),
  { ssr: false }
);

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: "GulfTrade Intelligence — Inventory & Demand Planner",
  description: "AI-based demand planning and stock distribution agent for B2B inventory management",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${jetbrains.variable} font-sans`}>
        <IntroOverlay />
        <Shell>
          <EmergencyAlertSystem />
          {children}
        </Shell>
      </body>
    </html>
  );
}
