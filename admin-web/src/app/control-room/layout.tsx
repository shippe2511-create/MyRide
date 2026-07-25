"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { GoogleMapsProvider } from "@/components/providers/google-maps-provider"
import { Loader2 } from "lucide-react"

/**
 * Control Room Layout
 * Full-screen layout without sidebar for wall display mode.
 * Requires authentication and appropriate permissions.
 */
export default function ControlRoomLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      router.push("/login")
      return
    }

    // Check role - allow super_admin, manager, supervisor, operator
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, department_id")
      .eq("id", user.id)
      .single()

    const allowedRoles = ["super_admin", "manager", "supervisor", "operator"]
    if (!profile || !allowedRoles.includes(profile.role)) {
      router.push("/dashboard")
      return
    }

    setAuthorized(true)
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="h-screen w-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading Control Room...</p>
        </div>
      </div>
    )
  }

  if (!authorized) {
    return null
  }

  return (
    <GoogleMapsProvider>
      <div className="h-screen w-screen bg-background overflow-hidden">
        {children}
      </div>
    </GoogleMapsProvider>
  )
}
