import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString('en-US', {
    timeZone: 'Indian/Maldives',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatDateTime(date: string | Date) {
  return new Date(date).toLocaleString('en-US', {
    timeZone: 'Indian/Maldives',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatTime(date: string | Date) {
  return new Date(date).toLocaleTimeString('en-US', {
    timeZone: 'Indian/Maldives',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Get date parts in Maldives timezone for grouping/aggregation
export function getMaldivesDateParts(date: string | Date) {
  const d = new Date(date)
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Indian/Maldives',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    weekday: 'short',
  })
  const parts = formatter.formatToParts(d)
  const get = (type: string) => parts.find(p => p.type === type)?.value || ''

  return {
    year: parseInt(get('year')),
    month: parseInt(get('month')) - 1, // 0-indexed like JS Date
    day: parseInt(get('day')),
    hour: parseInt(get('hour')),
    weekday: get('weekday'),
    dayOfWeek: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')),
  }
}

// Get current time in Maldives
export function getMaldivesNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Indian/Maldives' }))
}
