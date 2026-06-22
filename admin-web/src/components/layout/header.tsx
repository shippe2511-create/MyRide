"use client"

import { Bell, Search, Users, Car, AlertCircle } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

interface Profile {
  full_name: string
  email: string
  avatar_url: string | null
  role: string
}

interface Notification {
  id: string
  type: "pending_driver" | "pending_customer" | "alert"
  title: string
  message: string
  link: string
}

export function Header() {
  const router = useRouter()
  const supabase = createClient()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [notifCount, setNotifCount] = useState(0)
  const [searchQuery, setSearchQuery] = useState("")

  const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      // Route to appropriate page based on search context
      if (q.includes("driver")) {
        router.push(`/dashboard/drivers?search=${encodeURIComponent(q)}`)
      } else if (q.includes("customer") || q.includes("user")) {
        router.push(`/dashboard/customers?search=${encodeURIComponent(q)}`)
      } else if (q.includes("ride") || q.includes("trip")) {
        router.push(`/dashboard/rides?search=${encodeURIComponent(q)}`)
      } else {
        // Default to customers search
        router.push(`/dashboard/customers?search=${encodeURIComponent(q)}`)
      }
    }
  }

  useEffect(() => {
    loadProfile()
    loadNotifications()
  }, [])

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, email, avatar_url, role")
        .eq("id", user.id)
        .single()
      if (data) setProfile(data)
    }
  }

  async function loadNotifications() {
    const notifs: Notification[] = []

    // Check pending drivers
    const { count: pendingDrivers } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", "driver")
      .eq("status", "pending")

    if (pendingDrivers && pendingDrivers > 0) {
      notifs.push({
        id: "pending-drivers",
        type: "pending_driver",
        title: "Pending Driver Approvals",
        message: `${pendingDrivers} driver${pendingDrivers > 1 ? "s" : ""} awaiting approval`,
        link: "/dashboard/drivers?status=pending"
      })
    }

    // Check pending customers
    const { count: pendingCustomers } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", "customer")
      .eq("status", "pending")

    if (pendingCustomers && pendingCustomers > 0) {
      notifs.push({
        id: "pending-customers",
        type: "pending_customer",
        title: "Pending Customer Approvals",
        message: `${pendingCustomers} customer${pendingCustomers > 1 ? "s" : ""} awaiting approval`,
        link: "/dashboard/customers?status=pending"
      })
    }

    setNotifications(notifs)
    setNotifCount(notifs.length)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push("/login")
  }

  const handleNotificationClick = (link: string) => {
    router.push(link)
  }

  const initials = profile?.full_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase() || "AD"

  return (
    <header className="flex items-center gap-2">
      <div className="flex items-center gap-2">
        <ThemeToggle />

        {/* Notifications Dropdown */}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              {notifCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
                  {notifCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-80" align="end">
            <DropdownMenuLabel>Notifications</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {notifications.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                No pending notifications
              </div>
            ) : (
              notifications.map((notif) => (
                <DropdownMenuItem
                  key={notif.id}
                  className="flex items-start gap-3 p-3 cursor-pointer"
                  onSelect={() => handleNotificationClick(notif.link)}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-yellow-500/10">
                    {notif.type === "pending_driver" ? (
                      <Car className="h-4 w-4 text-yellow-500" />
                    ) : notif.type === "pending_customer" ? (
                      <Users className="h-4 w-4 text-yellow-500" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-yellow-500" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{notif.title}</p>
                    <p className="text-xs text-muted-foreground">{notif.message}</p>
                  </div>
                </DropdownMenuItem>
              ))
            )}
            {notifications.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-center text-sm text-primary cursor-pointer justify-center"
                  onSelect={() => router.push("/dashboard")}
                >
                  View Dashboard
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User Profile Dropdown */}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-9 w-9 rounded-full">
              <Avatar className="h-9 w-9">
                <AvatarImage src={profile?.avatar_url || undefined} alt={profile?.full_name || "Admin"} />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{profile?.full_name || "Admin"}</p>
                <p className="text-xs leading-none text-muted-foreground">
                  {profile?.email || "admin@myride.mv"}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => router.push("/dashboard/settings")}>
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={handleLogout}>
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
