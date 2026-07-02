"use client"

import { useEffect, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"

export function SOSAlertListener() {
  const supabase = createClient()
  const audioContextRef = useRef<AudioContext | null>(null)

  const playAlarmSound = () => {
    try {
      // Create or resume audio context (required after user interaction)
      if (!audioContextRef.current) {
        const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        audioContextRef.current = new AudioContextClass()
      }

      const audioContext = audioContextRef.current
      if (audioContext.state === 'suspended') {
        audioContext.resume()
      }

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
    console.log('SOSAlertListener: Setting up realtime subscription...')

    const channel = supabase
      .channel('sos_alerts_realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'sos_alerts'
        },
        (payload) => {
          console.log('SOSAlertListener: Received SOS alert:', payload)
          const newAlert = payload.new as { status?: string; user_id?: string }
          if (newAlert && newAlert.status === 'active') {
            console.log('SOSAlertListener: Active SOS - showing alert!')
            playAlarmSound()
            toast.error("🚨 NEW SOS ALERT! Check SOS Alerts page immediately!", {
              duration: 15000,
              action: {
                label: "View",
                onClick: () => window.location.href = "/dashboard/sos"
              }
            })
          }
        }
      )
      .subscribe((status, err) => {
        console.log('SOSAlertListener: Subscription status:', status, err)
      })

    return () => {
      console.log('SOSAlertListener: Cleaning up subscription')
      supabase.removeChannel(channel)
    }
  }, [])

  return null
}
