"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Permission, hasPermission, hasAnyPermission, getPermissionsForRole } from "@/lib/permissions"

const ROLE_CACHE_KEY = "myride_admin_role"
const PERMS_CACHE_KEY = "myride_admin_custom_perms"

export function usePermissions() {
  const [role, setRole] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem(ROLE_CACHE_KEY)
    }
    return null
  })
  const [customPermissions, setCustomPermissions] = useState<Record<string, boolean>>(() => {
    if (typeof window !== "undefined") {
      const cached = sessionStorage.getItem(PERMS_CACHE_KEY)
      return cached ? JSON.parse(cached) : {}
    }
    return {}
  })
  const [loading, setLoading] = useState(!role)
  const supabase = createClient()

  useEffect(() => {
    if (!role) {
      loadRole()
    }
  }, [])

  const loadRole = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }

    // Try by ID first, then by email
    let { data: profile } = await supabase
      .from("profiles")
      .select("role, custom_permissions")
      .eq("id", user.id)
      .single()

    if (!profile && user.email) {
      const { data: profileByEmail } = await supabase
        .from("profiles")
        .select("role, custom_permissions")
        .eq("email", user.email)
        .single()
      profile = profileByEmail
    }

    const userRole = profile?.role || null
    const userCustomPerms = profile?.custom_permissions || {}
    setRole(userRole)
    setCustomPermissions(userCustomPerms)
    if (userRole) {
      sessionStorage.setItem(ROLE_CACHE_KEY, userRole)
      sessionStorage.setItem(PERMS_CACHE_KEY, JSON.stringify(userCustomPerms))
    }
    setLoading(false)
  }

  const can = (permission: Permission): boolean => {
    if (!role) return false
    // Check custom override first
    if (customPermissions[permission] !== undefined) {
      return customPermissions[permission]
    }
    // Fall back to role-based permission
    return hasPermission(role, permission)
  }

  const canAny = (permissions: Permission[]): boolean => {
    if (!role) return false
    return hasAnyPermission(role, permissions)
  }

  const canManage = (resource: string): boolean => {
    return can(`${resource}:manage` as Permission)
  }

  const canView = (resource: string): boolean => {
    return can(`${resource}:view` as Permission)
  }

  return {
    role,
    loading,
    can,
    canAny,
    canManage,
    canView,
    permissions: role ? getPermissionsForRole(role) : [],
    isSuperAdmin: role === "super-admin",
    isAdmin: role === "admin" || role === "super-admin",
  }
}
