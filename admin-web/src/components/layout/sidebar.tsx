"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Users,
  Car,
  CarFront,
  MapPin,
  Calendar,
  FileText,
  Map,
  Shield,
  BarChart3,
  Settings,
  Ticket,
  LogOut,
  AlertTriangle,
  MessageSquare,
  ClipboardCheck,
  Star,
  Radio,
  Activity,
  Fuel,
  UserCircle,
  Truck,
  Navigation,
  ShieldAlert,
  TrendingUp,
  Cog,
  HelpCircle,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { usePermissions } from "@/hooks/usePermissions"
import type { Permission } from "@/lib/permissions"
import { Badge } from "@/components/ui/badge"

interface NavItem {
  name: string
  href: string
  icon: typeof LayoutDashboard
  permission: Permission
}

interface NavSection {
  name: string
  icon: typeof LayoutDashboard
  href?: string
  permission: Permission
  items?: NavItem[]
}

const navigationSections: NavSection[] = [
  { name: "Dashboard", icon: LayoutDashboard, href: "/dashboard", permission: "dashboard:view" },
  {
    name: "People",
    icon: UserCircle,
    permission: "customers:view",
    items: [
      { name: "Customers", href: "/dashboard/customers", icon: Users, permission: "customers:view" },
      { name: "Drivers", href: "/dashboard/drivers", icon: Car, permission: "drivers:view" },
      { name: "Eligibility", href: "/dashboard/eligibility", icon: Ticket, permission: "eligibility:view" },
    ]
  },
  {
    name: "Fleet",
    icon: Truck,
    permission: "vehicles:view",
    items: [
      { name: "Vehicles", href: "/dashboard/vehicles", icon: CarFront, permission: "vehicles:view" },
      { name: "Vehicle Logs", href: "/dashboard/vehicle-logs", icon: Fuel, permission: "vehicles:view" },
      { name: "Pre-trip Checks", href: "/dashboard/checklists", icon: ClipboardCheck, permission: "pretrip:view" },
    ]
  },
  {
    name: "Operations",
    icon: Navigation,
    permission: "rides:view",
    items: [
      { name: "Rides", href: "/dashboard/rides", icon: MapPin, permission: "rides:view" },
      { name: "Live Tracking", href: "/dashboard/tracking", icon: Radio, permission: "tracking:view" },
      { name: "Schedules", href: "/dashboard/scheduling", icon: Calendar, permission: "schedules:view" },
      { name: "Service Zones", href: "/dashboard/zones", icon: Map, permission: "zones:view" },
    ]
  },
  {
    name: "Safety",
    icon: ShieldAlert,
    permission: "sos:view",
    items: [
      { name: "SOS Alerts", href: "/dashboard/sos", icon: AlertTriangle, permission: "sos:view" },
      { name: "Incidents", href: "/dashboard/incidents", icon: AlertTriangle, permission: "sos:view" },
    ]
  },
  {
    name: "Insights",
    icon: TrendingUp,
    permission: "reports:view",
    items: [
      { name: "Analytics", href: "/dashboard/analytics", icon: BarChart3, permission: "reports:view" },
      { name: "Reports", href: "/dashboard/reports", icon: FileText, permission: "reports:view" },
      { name: "Ratings", href: "/dashboard/ratings", icon: Star, permission: "ratings:view" },
      { name: "Activity Log", href: "/dashboard/activity", icon: Activity, permission: "reports:view" },
    ]
  },
  {
    name: "System",
    icon: Cog,
    permission: "settings:view",
    items: [
      { name: "Chat", href: "/dashboard/chat", icon: MessageSquare, permission: "chat:view" },
      { name: "Content", href: "/dashboard/content", icon: FileText, permission: "content:view" },
      { name: "Help Center", href: "/dashboard/help", icon: HelpCircle, permission: "content:view" },
      { name: "Admins", href: "/dashboard/admins", icon: Shield, permission: "admins:view" },
      { name: "Settings", href: "/dashboard/settings", icon: Settings, permission: "settings:view" },
    ]
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const { can, loading } = usePermissions()
  const [badges, setBadges] = useState<Record<string, number>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  useEffect(() => {
    loadBadges()

    const channel = supabase
      .channel('sidebar_badges')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => loadBadges())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, () => loadBadges())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sos_alerts' }, () => loadBadges())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents' }, () => loadBadges())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_documents' }, () => loadBadges())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicle_checklists' }, () => loadBadges())
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const loadBadges = async () => {
    const [pendingCustomers, pendingDrivers, activeSOS, openIncidents, pendingDocs, checklistIssues] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'customer').eq('status', 'pending'),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'driver').eq('status', 'pending'),
      supabase.from('sos_alerts').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('incidents').select('*', { count: 'exact', head: true }).eq('status', 'open'),
      supabase.from('driver_documents').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('vehicle_checklists').select('*', { count: 'exact', head: true }).eq('has_issues', true),
    ])

    setBadges({
      '/dashboard/customers': pendingCustomers.count || 0,
      '/dashboard/drivers': (pendingDrivers.count || 0) + (pendingDocs.count || 0),
      '/dashboard/sos': activeSOS.count || 0,
      '/dashboard/incidents': openIncidents.count || 0,
      '/dashboard/checklists': checklistIssues.count || 0,
    })
  }

  const handleLogout = async () => {
    sessionStorage.removeItem("myride_admin_role")
    sessionStorage.removeItem("myride_admin_custom_perms")
    await supabase.auth.signOut()
    router.push("/login")
  }

  const getVisibleSections = () => {
    if (loading) return navigationSections
    return navigationSections.map(section => {
      if (!section.items) return section
      return {
        ...section,
        items: section.items.filter(item => can(item.permission))
      }
    }).filter(section => !section.items || section.items.length > 0)
  }

  const visibleSections = getVisibleSections()

  const isSectionActive = (section: NavSection) => {
    if (section.href) {
      return pathname === section.href
    }
    return section.items?.some(item =>
      pathname === item.href || pathname.startsWith(item.href + "/")
    )
  }

  return (
    <div className="flex h-full w-56 flex-col border-r bg-card">
      <div className="flex h-14 items-center border-b px-4">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Car className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-bold">MyRide</span>
        </Link>
      </div>
      <nav className="flex-1 p-3 overflow-y-auto">
        <div className="space-y-1">
          {visibleSections.map((section) => {
            const isExpanded = expanded[section.name] ?? isSectionActive(section)
            const sectionBadgeCount = section.items?.reduce((sum, item) => sum + (badges[item.href] || 0), 0) || 0

            if (section.href) {
              const isActive = pathname === section.href
              return (
                <Link
                  key={section.name}
                  href={section.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <section.icon className="h-5 w-5" />
                  <span>{section.name}</span>
                </Link>
              )
            }

            return (
              <div key={section.name}>
                <button
                  onClick={() => setExpanded(prev => ({ ...prev, [section.name]: !isExpanded }))}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                    isSectionActive(section)
                      ? "text-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <section.icon className="h-5 w-5" />
                  <span className="flex-1 text-left">{section.name}</span>
                  {sectionBadgeCount > 0 && !isExpanded && (
                    <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-xs">
                      {sectionBadgeCount}
                    </Badge>
                  )}
                </button>
                {isExpanded && section.items && (
                  <div className="ml-8 mt-1 space-y-0.5">
                    {section.items.map((item) => {
                      const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
                      return (
                        <Link
                          key={item.name}
                          href={item.href}
                          className={cn(
                            "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                            isActive
                              ? "bg-primary text-primary-foreground font-medium"
                              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                          )}
                        >
                          <item.icon className="h-4 w-4" />
                          <span className="flex-1">{item.name}</span>
                          {badges[item.href] > 0 && (
                            <Badge
                              variant={item.href === '/dashboard/sos' ? 'destructive' : 'secondary'}
                              className={cn(
                                "h-5 min-w-5 px-1.5 text-xs",
                                item.href === '/dashboard/sos' && "animate-pulse"
                              )}
                            >
                              {badges[item.href]}
                            </Badge>
                          )}
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </nav>
      <div className="border-t p-3">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground"
        >
          <LogOut className="h-4 w-4" />
          Log out
        </button>
      </div>
    </div>
  )
}
