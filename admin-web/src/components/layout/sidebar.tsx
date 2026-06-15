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
  Star,
  Shield,
  BarChart3,
  Settings,
  Ticket,
  LogOut,
  AlertTriangle,
  MessageSquare,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Customers", href: "/dashboard/customers", icon: Users },
  { name: "Drivers", href: "/dashboard/drivers", icon: Car },
  { name: "Vehicles", href: "/dashboard/vehicles", icon: CarFront },
  { name: "Rides", href: "/dashboard/rides", icon: MapPin },
  { name: "Eligibility", href: "/dashboard/eligibility", icon: Ticket },
  { name: "Scheduling", href: "/dashboard/scheduling", icon: Calendar },
  { name: "Content", href: "/dashboard/content", icon: FileText },
  { name: "Service Zones", href: "/dashboard/zones", icon: Map },
  { name: "Chat", href: "/dashboard/chat", icon: MessageSquare },
  { name: "SOS Alerts", href: "/dashboard/sos", icon: AlertTriangle },
  { name: "Admins", href: "/dashboard/admins", icon: Shield },
  { name: "Reports", href: "/dashboard/reports", icon: BarChart3 },
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
    <div className="flex h-full w-64 flex-col border-r bg-card">
      <div className="flex h-16 items-center border-b px-6">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Car className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold">MyRide Admin</span>
        </Link>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {navigation.map((item) => {
          const isActive = item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname === item.href || pathname.startsWith(item.href + "/")
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          )
        })}
      </nav>
      <div className="border-t p-4">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground"
        >
          <LogOut className="h-5 w-5" />
          Log out
        </button>
      </div>
    </div>
  )
}
