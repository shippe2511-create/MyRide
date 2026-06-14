"use client"

import { useEffect } from "react"
import { createClient } from "@/lib/supabase/client"

type RealtimeCallback = () => void

export function useRealtime(tables: string[], callback: RealtimeCallback) {
  useEffect(() => {
    const supabase = createClient()

    const channel = supabase.channel('realtime-changes')

    tables.forEach(table => {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => {
          callback()
        }
      )
    })

    channel.subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [tables, callback])
}

export function useRealtimeRefresh(tables: string[]) {
  useEffect(() => {
    const supabase = createClient()

    const channel = supabase.channel('realtime-refresh')

    tables.forEach(table => {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => {
          window.location.reload()
        }
      )
    })

    channel.subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [tables])
}
