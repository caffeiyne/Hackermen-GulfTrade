"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { WSEvent } from "./types";

// Resolve WebSocket URL:
// 1. NEXT_PUBLIC_WS_URL env var (production / Railway) — checked first
// 2. If HTTPS (tunnel/cloud), try same host /ws/live — may fail gracefully
// 3. Derive from browser location on port 8000 (LAN dev)
// 4. localhost fallback (SSR / local dev)
function getWsUrl(): string {
  if (process.env.NEXT_PUBLIC_WS_URL) {
    return process.env.NEXT_PUBLIC_WS_URL.replace(/\/$/, "");
  }
  if (typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    // If HTTPS (cloudflare tunnel / production), use same host — no port
    if (window.location.protocol === "https:") {
      return `${proto}//${window.location.host}/ws/live`;
    }
    // LAN dev — same hostname on port 8000
    return `${proto}//${window.location.hostname}:8000/ws/live`;
  }
  return "ws://localhost:8000/ws/live";
}

const WS_URL = getWsUrl();

interface UseRealTimeOptions {
  onEvent?: (event: WSEvent) => void;
  maxEvents?: number;
}

interface UseRealTimeResult {
  events: WSEvent[];
  isConnected: boolean;
  latestEvent: WSEvent | null;
  clearEvents: () => void;
}

/**
 * WebSocket hook for real-time simulator events.
 * Connects to the FastAPI /ws/live endpoint and maintains a rolling event list.
 */
export function useRealTime(options: UseRealTimeOptions = {}): UseRealTimeResult {
  const { onEvent, maxEvents = 50 } = options;
  const [events, setEvents] = useState<WSEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [latestEvent, setLatestEvent] = useState<WSEvent | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  const connect = useCallback(() => {
    if (typeof window === "undefined") return;

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        reconnectAttempts.current = 0;
        console.log("[WS] Connected to simulator");
      };

      ws.onmessage = (e) => {
        try {
          const event: WSEvent = JSON.parse(e.data);
          setLatestEvent(event);
          setEvents((prev) => [event, ...prev].slice(0, maxEvents));
          onEvent?.(event);
        } catch (err) {
          console.error("[WS] Parse error:", err);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        if (reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++;
          console.log(`[WS] Disconnected, reconnecting (${reconnectAttempts.current}/${maxReconnectAttempts})...`);
          reconnectTimer.current = setTimeout(connect, 3000);
        } else {
          console.log("[WS] Max reconnection attempts reached — using REST polling only");
        }
      };

      ws.onerror = (err) => {
        console.error("[WS] Error:", err);
        ws.close();
      };
    } catch (err) {
      console.error("[WS] Connection failed:", err);
      if (reconnectAttempts.current < maxReconnectAttempts) {
        reconnectAttempts.current++;
        reconnectTimer.current = setTimeout(connect, 3000);
      }
    }
  }, [onEvent, maxEvents]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [connect]);

  const clearEvents = useCallback(() => setEvents([]), []);

  return { events, isConnected, latestEvent, clearEvents };
}
