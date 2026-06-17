'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, Home } from 'lucide-react'

const routeNames: Record<string, string> = {
  dashboard: 'Dashboard',
  customers: 'Customers',
  drivers: 'Drivers',
  vehicles: 'Vehicles',
  rides: 'Rides',
  tracking: 'Live Tracking',
  scheduling: 'Schedules',
  checklists: 'Pre-trip Checks',
  eligibility: 'Eligibility',
  content: 'Content',
  zones: 'Service Zones',
  chat: 'Chat',
  sos: 'SOS Alerts',
  ratings: 'Ratings',
  reports: 'Reports',
  activity: 'Activity Log',
  admins: 'Admins',
  settings: 'Settings',
}

export function Breadcrumbs() {
  const pathname = usePathname()
  const segments = pathname.split('/').filter(Boolean)

  if (segments.length <= 1) return null

  const crumbs = segments.map((segment, index) => {
    const href = '/' + segments.slice(0, index + 1).join('/')
    const name = routeNames[segment] || segment.charAt(0).toUpperCase() + segment.slice(1)
    const isLast = index === segments.length - 1

    return { name, href, isLast }
  })

  return (
    <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4">
      <Link
        href="/dashboard"
        className="flex items-center hover:text-foreground transition-colors"
      >
        <Home className="h-4 w-4" />
      </Link>

      {crumbs.map((crumb, index) => (
        <div key={crumb.href} className="flex items-center gap-1.5">
          <ChevronRight className="h-4 w-4" />
          {crumb.isLast ? (
            <span className="font-medium text-foreground">{crumb.name}</span>
          ) : (
            <Link
              href={crumb.href}
              className="hover:text-foreground transition-colors"
            >
              {crumb.name}
            </Link>
          )}
        </div>
      ))}
    </nav>
  )
}
