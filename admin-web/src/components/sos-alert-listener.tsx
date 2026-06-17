"use client"

import { useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"

export function SOSAlertListener() {
  const supabase = createClient()

  const playAlarmSound = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const audioContext = new AudioContextClass()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)

      oscillator.type = 'sawtooth'
      gainNode.gain.value = 0.5

      oscillator.start()

      let time = audioContext.currentTime
      for (let i = 0; i < 6; i++) {
        oscillator.frequency.setValueAtTime(600, time)
        oscillator.frequency.linearRampToValueAtTime(1200, time + 0.25)
        oscillator.frequency.linearRampToValueAtTime(600, time + 0.5)
        time += 0.5
      }

      oscillator.stop(audioContext.currentTime + 3)
    } catch (e) {
      console.error('Audio error:', e)
    }
  }

  useEffect(() => {
    const channel = supabase
      .channel('global_sos_alerts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sos_alerts' }, (payload) => {
        if (payload.new && payload.new.status === 'active') {
          playAlarmSound()
          toast.error("🚨 NEW SOS ALERT! Check SOS Alerts page immediately!", {
            duration: 15000,
            action: {
              label: "View",
              onClick: () => window.location.href = "/dashboard/sos"
            }
          })
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  return null
}
