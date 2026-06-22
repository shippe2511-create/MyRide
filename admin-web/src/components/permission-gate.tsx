"use client"

import { usePermissions } from "@/hooks/usePermissions"
import { Permission } from "@/lib/permissions"
import { ShieldX, Loader2 } from "lucide-react"

interface PermissionGateProps {
  permission: Permission
  children: React.ReactNode
  fallback?: React.ReactNode
}

function DefaultFallback() {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mb-4">
        <ShieldX className="h-8 w-8 text-destructive" />
      </div>
      <h3 className="text-lg font-semibold mb-1">Access Denied</h3>
      <p className="text-sm text-muted-foreground max-w-sm">
        You don't have permission to view this page. Contact your administrator if you believe this is an error.
      </p>
    </div>
  )
}

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  )
}

export function PermissionGate({ permission, children, fallback }: PermissionGateProps) {
  const { can, loading } = usePermissions()

  if (loading) {
    return <LoadingFallback />
  }

  if (!can(permission)) {
    return fallback ?? <DefaultFallback />
  }

  return <>{children}</>
}

export function ManageGate({ resource, children }: { resource: string; children: React.ReactNode }) {
  const { canManage, loading } = usePermissions()

  if (loading) return null

  if (!canManage(resource)) return null

  return <>{children}</>
}
