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
      case '/':
        e.preventDefault()
        // Show shortcuts help
        toast.info(
          <div className="text-sm">
            <div className="font-semibold mb-2">Keyboard Shortcuts</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <span className="opacity-70">Cmd+K</span><span>Search</span>
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
