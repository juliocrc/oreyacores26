"use client";

import { useEffect, useState, useCallback } from "react";

export interface SSEMessage {
  type: string;
  message?: string;
  timestamp?: number;
  [key: string]: unknown;
}

export function useNotificationsSSE(onMessage?: (data: SSEMessage) => void) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<SSEMessage | null>(null);

  const handleMessage = useCallback((data: SSEMessage) => {
    setLastMessage(data);
    if (onMessage) {
      onMessage(data);
    }
  }, [onMessage]);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout;

    function connect() {
      try {
        eventSource = new EventSource("/api/notifications/stream");

        eventSource.onopen = () => {
          setIsConnected(true);
        };

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            handleMessage(data);
          } catch {}
        };

        eventSource.onerror = () => {
          setIsConnected(false);
          eventSource?.close();
          // Tentar reconectar após 5 segundos
          reconnectTimeout = setTimeout(connect, 5000);
        };
      } catch {
        setIsConnected(false);
        reconnectTimeout = setTimeout(connect, 5000);
      }
    }

    connect();

    return () => {
      if (eventSource) {
        eventSource.close();
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, [handleMessage]);

  return { isConnected, lastMessage };
}
