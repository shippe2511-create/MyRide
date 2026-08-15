"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Permission, hasPermission, hasAnyPermission, getPermissionsForRole, STAFF_ROLES, type Role } from "@/lib/permissions"

const ROLE_CACHE_KEY = "myride_admin_role"
const PERMS_CACHE_KEY = "myride_admin_custom_perms"
const DEPT_CACHE_KEY = "myride_admin_dept"

// Transport department ID
const TRANSPORT_DEPT_ID = "d5772aaa-02f7-4b56-bc3c-96cd7aaacd7d"

// Legacy role mapping - only for old role names that no longer exist
const LEGACY_ROLE_MAP: Record<string, Role> = {
  "admin": "super_admin",
  "super-admin": "super_admin",
}

function normalizeRole(role: string): Role | null {
  if (LEGACY_ROLE_MAP[role]) {
    return LEGACY_ROLE_MAP[role]
  }
  if (STAFF_ROLES.includes(role as Role)) {
    return role as Role
  }
  return null
}

export function usePermissions() {
  const [role, setRole] = useState<string | null>(null)
  const [departmentId, setDepartmentId] = useState<string | null>(null)
  const [customPermissions, setCustomPermissions] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    // Check sessionStorage first
    const cachedRole = sessionStorage.getItem(ROLE_CACHE_KEY)
    const cachedPerms = sessionStorage.getItem(PERMS_CACHE_KEY)
    const cachedDept = sessionStorage.getItem(DEPT_CACHE_KEY)

    if (cachedRole) {
      setRole(cachedRole)
      setDepartmentId(cachedDept)
      setCustomPermissions(cachedPerms ? JSON.parse(cachedPerms) : {})
      setLoading(false)
    } else {
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
      .select("role, custom_permissions, department_id")
      .eq("id", user.id)
      .single()

    if (!profile && user.email) {
      const { data: profileByEmail } = await supabase
        .from("profiles")
        .select("role, custom_permissions, department_id")
        .eq("email", user.email)
        .single()
      profile = profileByEmail
    }

    const userRole = profile?.role || null
    const userDeptId = profile?.department_id || null
    const userCustomPerms = profile?.custom_permissions || {}
    setRole(userRole)
    setDepartmentId(userDeptId)
    setCustomPermissions(userCustomPerms)
    if (userRole) {
      sessionStorage.setItem(ROLE_CACHE_KEY, userRole)
      sessionStorage.setItem(PERMS_CACHE_KEY, JSON.stringify(userCustomPerms))
      if (userDeptId) {
        sessionStorage.setItem(DEPT_CACHE_KEY, userDeptId)
      }
    }
    setLoading(false)
  }

  const clearCache = () => {
    sessionStorage.removeItem(ROLE_CACHE_KEY)
    sessionStorage.removeItem(PERMS_CACHE_KEY)
    sessionStorage.removeItem(DEPT_CACHE_KEY)
  }

  // Check if user is in Transport department (or super_admin who can see everything)
  const isTransportDepartment = (): boolean => {
    if (normalizeRole(role || "") === "super_admin") return true
    return departmentId === TRANSPORT_DEPT_ID
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

  // Normalize role for tier checks
  const normalizedRole = role ? normalizeRole(role) : null

  // Check if user can view all departments (super_admin OR has departments:view_all permission)
  const canViewAllDepts = normalizedRole === "super_admin" || customPermissions["departments:view_all"] === true

  return {
    role,
    normalizedRole,
    departmentId,
    loading,
    can,
    canAny,
    canManage,
    canView,
    clearCache,
    isTransportDepartment,
    canViewAllDepts,
    permissions: role ? getPermissionsForRole(role) : [],
    // Tier checks
    isSuperAdmin: normalizedRole === "super_admin",
    isManager: normalizedRole === "manager",
    isOperator: normalizedRole === "operator",
    isManagerOrAbove: normalizedRole === "super_admin" || normalizedRole === "manager",
    isOperatorOrAbove: normalizedRole === "super_admin" || normalizedRole === "manager" || normalizedRole === "operator",
    // Legacy compatibility
    isAdmin: normalizedRole === "super_admin",
  }
}
