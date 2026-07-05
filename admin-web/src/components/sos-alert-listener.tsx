"use client"

import { useEffect, useRef, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"

export function SOSAlertListener() {
  const supabase = createClient()
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const stopAlarm = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current.onplay = null
    }
  }, [])

  const playAlarmSound = useCallback(() => {
    try {
      // Stop any existing alarm
      stopAlarm()

      // Create audio element if not exists
      if (!audioRef.current) {
        audioRef.current = new Audio('/alarm.mp3')
        audioRef.current.loop = true
        audioRef.current.volume = 1.0
      }

      // Play the alarm
      audioRef.current.play().catch(() => {
        // Silently handle AbortError (pause called before play finished)
        // Only fallback if it's a real error (not user interaction)
      })

      // Stop after 15 seconds
      setTimeout(() => {
        stopAlarm()
      }, 15000)

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

  const playFallbackSiren = useCallback(() => {
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const audioContext = new AudioContextClass()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)
      oscillator.type = 'sawtooth'
      gainNode.gain.value = 0.9

      oscillator.start()

      let time = audioContext.currentTime
      for (let i = 0; i < 16; i++) {
        oscillator.frequency.setValueAtTime(400, time)
        oscillator.frequency.linearRampToValueAtTime(1500, time + 0.25)
        oscillator.frequency.linearRampToValueAtTime(400, time + 0.5)
        time += 0.5
      }
      oscillator.stop(audioContext.currentTime + 8)
    } catch (e) {
      console.error('Fallback siren error:', e)
    }
  }, [])

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
