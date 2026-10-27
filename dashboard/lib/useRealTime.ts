"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { WSEvent } from "./types";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws/live";

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

  const connect = useCallback(() => {
    if (typeof window === "undefined") return;

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
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
        console.log("[WS] Disconnected, reconnecting in 3s...");
        reconnectTimer.current = setTimeout(connect, 3000);
      };

      ws.onerror = (err) => {
        console.error("[WS] Error:", err);
        ws.close();
      };
    } catch (err) {
      console.error("[WS] Connection failed:", err);
      reconnectTimer.current = setTimeout(connect, 3000);
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
