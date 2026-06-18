"use client"

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
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { usePermissions } from "@/hooks/usePermissions"
import type { Permission } from "@/lib/permissions"

const navigation: { name: string; href: string; icon: typeof LayoutDashboard; permission: Permission }[] = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, permission: "dashboard:view" },
  { name: "Customers", href: "/dashboard/customers", icon: Users, permission: "customers:view" },
  { name: "Drivers", href: "/dashboard/drivers", icon: Car, permission: "drivers:view" },
  { name: "Vehicles", href: "/dashboard/vehicles", icon: CarFront, permission: "vehicles:view" },
  { name: "Rides", href: "/dashboard/rides", icon: MapPin, permission: "rides:view" },
  { name: "Live Tracking", href: "/dashboard/tracking", icon: Radio, permission: "tracking:view" },
  { name: "Schedules", href: "/dashboard/scheduling", icon: Calendar, permission: "schedules:view" },
  { name: "Pre-trip Checks", href: "/dashboard/checklists", icon: ClipboardCheck, permission: "pretrip:view" },
  { name: "Eligibility", href: "/dashboard/eligibility", icon: Ticket, permission: "eligibility:view" },
  { name: "Content", href: "/dashboard/content", icon: FileText, permission: "content:view" },
  { name: "Service Zones", href: "/dashboard/zones", icon: Map, permission: "zones:view" },
  { name: "Chat", href: "/dashboard/chat", icon: MessageSquare, permission: "chat:view" },
  { name: "SOS Alerts", href: "/dashboard/sos", icon: AlertTriangle, permission: "sos:view" },
  { name: "Incidents", href: "/dashboard/incidents", icon: AlertTriangle, permission: "sos:view" },
  { name: "Ratings", href: "/dashboard/ratings", icon: Star, permission: "ratings:view" },
  { name: "Analytics", href: "/dashboard/analytics", icon: BarChart3, permission: "reports:view" },
  { name: "Reports", href: "/dashboard/reports", icon: FileText, permission: "reports:view" },
  { name: "Report Builder", href: "/dashboard/report-builder", icon: BarChart3, permission: "reports:view" },
  { name: "Activity Log", href: "/dashboard/activity", icon: Activity, permission: "reports:view" },
  { name: "Admins", href: "/dashboard/admins", icon: Shield, permission: "admins:view" },
  { name: "Settings", href: "/dashboard/settings", icon: Settings, permission: "settings:view" },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const { can, loading } = usePermissions()

  const handleLogout = async () => {
    sessionStorage.removeItem("myride_admin_role")
    sessionStorage.removeItem("myride_admin_custom_perms")
    await supabase.auth.signOut()
    router.push("/login")
  }

  const visibleNavigation = loading ? navigation : navigation.filter(item => can(item.permission))

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
      <nav className="flex-1 space-y-0.5 p-3 overflow-y-auto">
        {visibleNavigation.map((item) => {
          const isActive = item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname === item.href || pathname.startsWith(item.href + "/")
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </Link>
          )
        })}
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
