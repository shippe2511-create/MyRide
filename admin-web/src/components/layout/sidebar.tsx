"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
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
  TicketCheck,
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
  Smartphone,
  Mic,
  ChevronLeft,
  ChevronRight,
  Clock,
  Layers,
  Building2,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { usePermissions } from "@/hooks/usePermissions"
import type { Permission } from "@/lib/permissions"

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
      { name: "Pending Changes", href: "/dashboard/pending-changes", icon: Clock, permission: "customers:view" },
      { name: "Eligibility", href: "/dashboard/eligibility", icon: Ticket, permission: "eligibility:view" },
      { name: "Service Pools", href: "/dashboard/pools", icon: Layers, permission: "pools:view" },
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
      { name: "Push to Talk", href: "/dashboard/push-to-talk", icon: Mic, permission: "settings:view" },
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
      { name: "Support Chat", href: "/dashboard/support-chat", icon: MessageSquare, permission: "chat:view" },
      { name: "Support Tickets", href: "/dashboard/support-tickets", icon: TicketCheck, permission: "sos:view" },
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
      { name: "App Config", href: "/dashboard/app-config", icon: Smartphone, permission: "settings:view" },
      { name: "Content", href: "/dashboard/content", icon: FileText, permission: "content:view" },
      { name: "Chat", href: "/dashboard/chat", icon: MessageSquare, permission: "chat:view" },
      { name: "Users", href: "/dashboard/admins", icon: Shield, permission: "staff:view" },
      { name: "Departments", href: "/dashboard/departments", icon: Building2, permission: "departments:view" },
      { name: "Settings", href: "/dashboard/settings", icon: Settings, permission: "settings:view" },
    ]
  },
]

interface SidebarProps {
  collapsed?: boolean
  onCollapse?: (collapsed: boolean) => void
  onNavigate?: () => void
}

export function Sidebar({ collapsed = false, onCollapse, onNavigate }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const { can, loading } = usePermissions()
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [hoveredSection, setHoveredSection] = useState<string | null>(null)
  const [showLogoutDialog, setShowLogoutDialog] = useState(false)

  const handleLogout = async () => {
    sessionStorage.removeItem("myride_admin_role")
    sessionStorage.removeItem("myride_admin_custom_perms")
    await supabase.auth.signOut()
    router.push("/login")
  }

  const confirmLogout = () => {
    setShowLogoutDialog(true)
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
    <div className={cn(
      "flex h-full flex-col bg-sidebar border-r border-border transition-all duration-300",
      collapsed ? "w-16 overflow-visible" : "w-56"
    )}>
      <div className="flex h-14 items-center justify-between px-3">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Image
            src="/icon-192.png"
            alt="MyRide"
            width={32}
            height={32}
            className="rounded-lg flex-shrink-0"
          />
          {!collapsed && <span className="font-bold">MyRide</span>}
        </Link>
        <button
          onClick={() => onCollapse?.(!collapsed)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>
      <nav className={cn("flex-1 p-3", collapsed ? "overflow-visible" : "overflow-y-auto")}>
        <div className="space-y-1">
          {visibleSections.map((section) => {
            const isExpanded = expanded[section.name] ?? isSectionActive(section)

            if (section.href) {
              const isActive = pathname === section.href
              return (
                <Link
                  key={section.name}
                  href={section.href}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    collapsed && "justify-center px-2"
                  )}
                  title={collapsed ? section.name : undefined}
                >
                  <section.icon className="h-5 w-5 flex-shrink-0" />
                  {!collapsed && <span>{section.name}</span>}
                </Link>
              )
            }

            // When collapsed, show flyout menu on hover
            if (collapsed && section.items) {
              return (
                <div
                  key={section.name}
                  className="relative"
                  onMouseEnter={() => setHoveredSection(section.name)}
                  onMouseLeave={() => setHoveredSection(null)}
                >
                  <button
                    className={cn(
                      "flex w-full items-center justify-center rounded-md px-2 py-2.5 text-sm font-medium transition-colors",
                      isSectionActive(section)
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <section.icon className="h-5 w-5" />
                  </button>
                  {hoveredSection === section.name && (
                    <div className="absolute left-full top-0 z-50 pl-2">
                      <div className="min-w-[180px] rounded-md border bg-popover p-2 shadow-lg">
                        <div className="mb-2 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          {section.name}
                        </div>
                        {section.items.map((item) => {
                          const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
                          return (
                            <Link
                              key={item.name}
                              href={item.href}
                              onClick={() => {
                                setHoveredSection(null)
                                onNavigate?.()
                              }}
                              className={cn(
                                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                                isActive
                                  ? "bg-primary text-primary-foreground font-medium"
                                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                              )}
                            >
                              <item.icon className="h-4 w-4" />
                              <span>{item.name}</span>
                            </Link>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
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
                  <section.icon className="h-5 w-5 flex-shrink-0" />
                  <span className="flex-1 text-left">{section.name}</span>
                </button>
                {isExpanded && section.items && (
                  <div className="ml-8 mt-1 space-y-0.5">
                    {section.items.map((item) => {
                      const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
                      return (
                        <Link
                          key={item.name}
                          href={item.href}
                          onClick={onNavigate}
                          className={cn(
                            "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                            isActive
                              ? "bg-primary text-primary-foreground font-medium"
                              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                          )}
                        >
                          <item.icon className="h-4 w-4" />
                          <span className="flex-1">{item.name}</span>
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
      <div className="p-3">
        <button
          onClick={confirmLogout}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground",
            collapsed && "justify-center px-2"
          )}
          title={collapsed ? "Log out" : undefined}
        >
          <LogOut className="h-4 w-4 flex-shrink-0" />
          {!collapsed && "Log out"}
        </button>
      </div>

      <AlertDialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to log out?</AlertDialogTitle>
            <AlertDialogDescription>
              You will be signed out of the admin panel and redirected to the login page.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleLogout}>Log out</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
