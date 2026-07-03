"use client"

import { useEffect, useRef, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"

export function SOSAlertListener() {
  const supabase = createClient()
  const audioContextRef = useRef<AudioContext | null>(null)
  const oscillatorRef = useRef<OscillatorNode | null>(null)

  const stopAlarm = useCallback(() => {
    try {
      if (oscillatorRef.current) {
        oscillatorRef.current.stop()
        oscillatorRef.current = null
      }
    } catch (e) {
      // Ignore - oscillator may already be stopped
    }
  }, [])

  const playAlarmSound = useCallback(() => {
    try {
      // Stop any existing alarm
      stopAlarm()

      // Create or resume audio context
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
      oscillatorRef.current = oscillator

      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)

      oscillator.type = 'sawtooth'
      gainNode.gain.value = 0.9 // Loud!

      oscillator.start()

      // Urgent siren effect for 8 seconds
      let time = audioContext.currentTime
      for (let i = 0; i < 16; i++) {
        oscillator.frequency.setValueAtTime(400, time)
        oscillator.frequency.linearRampToValueAtTime(1500, time + 0.25)
        oscillator.frequency.linearRampToValueAtTime(400, time + 0.5)
        time += 0.5
      }

      oscillator.stop(audioContext.currentTime + 8)

      // Show browser notification
      if (typeof Notification !== 'undefined') {
        if (Notification.permission === 'granted') {
          new Notification('🚨 EMERGENCY SOS ALERT!', {
            body: 'A user has triggered an emergency SOS. Check admin panel immediately!',
            requireInteraction: true,
            tag: 'sos-emergency',
          })
        } else if (Notification.permission !== 'denied') {
          Notification.requestPermission()
        }
      }
    } catch (e) {
      console.error('Audio error:', e)
    }
  }, [stopAlarm])

  useEffect(() => {
    console.log('SOSAlertListener: Setting up realtime subscription...')

    // Request notification permission on mount
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission()
    }

    const channel = supabase
      .channel('sos_alerts_global')
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
            toast.error("🚨 EMERGENCY SOS ALERT!", {
              duration: 30000,
              description: "A user needs immediate help! Click to view details.",
              action: {
                label: "View SOS",
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
  }, [playAlarmSound, supabase])

  return null
}
