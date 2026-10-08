"use client";

import { useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

// Inicializa o cliente Supabase para escuta em tempo real (usa anon key publica)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const supabaseRealtimeClient = supabaseUrl && supabaseAnonKey 
  ? createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } }) 
  : null;

/**
 * Hook para subscrever a alterações numa tabela do Supabase em tempo real.
 */
export function useSupabaseRealtime(
  tableName: string,
  onDataChanged: (payload: { eventType: string; new: any; old: any }) => void
) {
  useEffect(() => {
    if (!supabaseRealtimeClient) return;

    const channel = supabaseRealtimeClient
      .channel(`public:${tableName}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: tableName },
        (payload) => {
          onDataChanged({
            eventType: payload.eventType,
            new: payload.new,
            old: payload.old,
          });
        }
      )
      .subscribe();

    return () => {
      supabaseRealtimeClient.removeChannel(channel);
    };
  }, [tableName, onDataChanged]);
}
