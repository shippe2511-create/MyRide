'use client'

import { useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

export function KeyboardShortcuts() {
  const router = useRouter()

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Only trigger on Cmd/Ctrl + key
    if (!e.metaKey && !e.ctrlKey) return

    // Don't trigger in input fields
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return
    }

    switch (e.key.toLowerCase()) {
      case 'd':
        e.preventDefault()
        router.push('/dashboard')
        toast.info('Dashboard', { duration: 1000 })
        break
      case 'c':
        e.preventDefault()
        router.push('/dashboard/customers')
        toast.info('Customers', { duration: 1000 })
        break
      case 'r':
        e.preventDefault()
        router.push('/dashboard/rides')
        toast.info('Rides', { duration: 1000 })
        break
      case 's':
        e.preventDefault()
        router.push('/dashboard/sos')
        toast.info('SOS Alerts', { duration: 1000 })
        break
      case 'g':
        if (e.shiftKey) {
          e.preventDefault()
          router.push('/dashboard/drivers')
          toast.info('Drivers', { duration: 1000 })
        }
        break
      case '/':
        e.preventDefault()
        // Show shortcuts help
        toast.info(
          <div className="text-sm">
            <div className="font-semibold mb-2">Keyboard Shortcuts</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <span className="opacity-70">Cmd+K</span><span>Search</span>
              <span className="opacity-70">Cmd+D</span><span>Dashboard</span>
              <span className="opacity-70">Cmd+C</span><span>Customers</span>
              <span className="opacity-70">Cmd+R</span><span>Rides</span>
              <span className="opacity-70">Cmd+S</span><span>SOS Alerts</span>
              <span className="opacity-70">Cmd+Shift+G</span><span>Drivers</span>
            </div>
          </div>,
          { duration: 5000 }
        )
        break
    }
  }, [router])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return null
}
