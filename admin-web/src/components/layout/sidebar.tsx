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
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Customers", href: "/dashboard/customers", icon: Users },
  { name: "Drivers", href: "/dashboard/drivers", icon: Car },
  { name: "Vehicles", href: "/dashboard/vehicles", icon: CarFront },
  { name: "Rides", href: "/dashboard/rides", icon: MapPin },
  { name: "Schedules", href: "/dashboard/scheduling", icon: Calendar },
  { name: "Pre-trip Checks", href: "/dashboard/checklists", icon: ClipboardCheck },
  { name: "Eligibility", href: "/dashboard/eligibility", icon: Ticket },
  { name: "Content", href: "/dashboard/content", icon: FileText },
  { name: "Service Zones", href: "/dashboard/zones", icon: Map },
  { name: "Chat", href: "/dashboard/chat", icon: MessageSquare },
  { name: "SOS Alerts", href: "/dashboard/sos", icon: AlertTriangle },
  { name: "Ratings", href: "/dashboard/ratings", icon: Star },
  { name: "Reports", href: "/dashboard/reports", icon: BarChart3 },
  { name: "Admins", href: "/dashboard/admins", icon: Shield },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push("/login")
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
      <nav className="flex-1 space-y-0.5 p-3 overflow-y-auto">
        {navigation.map((item) => {
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
