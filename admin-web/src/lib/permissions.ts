export type Permission =
  | "dashboard:view"
  | "customers:view"
  | "customers:manage"
  | "drivers:view"
  | "drivers:manage"
  | "vehicles:view"
  | "vehicles:manage"
  | "rides:view"
  | "rides:manage"
  | "tracking:view"
  | "schedules:view"
  | "schedules:manage"
  | "pretrip:view"
  | "pretrip:manage"
  | "eligibility:view"
  | "eligibility:manage"
  | "content:view"
  | "content:manage"
  | "zones:view"
  | "zones:manage"
  | "chat:view"
  | "chat:manage"
  | "sos:view"
  | "sos:manage"
  | "ratings:view"
  | "ratings:manage"
  | "reports:view"
  | "admins:view"
  | "admins:manage"
  | "settings:view"
  | "settings:manage"

export type Role = "super-admin" | "admin" | "operator" | "support" | "viewer"

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  "super-admin": [
    "dashboard:view",
    "customers:view", "customers:manage",
    "drivers:view", "drivers:manage",
    "vehicles:view", "vehicles:manage",
    "rides:view", "rides:manage",
    "tracking:view",
    "schedules:view", "schedules:manage",
    "pretrip:view", "pretrip:manage",
    "eligibility:view", "eligibility:manage",
    "content:view", "content:manage",
    "zones:view", "zones:manage",
    "chat:view", "chat:manage",
    "sos:view", "sos:manage",
    "ratings:view", "ratings:manage",
    "reports:view",
    "admins:view", "admins:manage",
    "settings:view", "settings:manage",
  ],
  "admin": [
    "dashboard:view",
    "customers:view", "customers:manage",
    "drivers:view", "drivers:manage",
    "vehicles:view", "vehicles:manage",
    "rides:view", "rides:manage",
    "tracking:view",
    "schedules:view", "schedules:manage",
    "pretrip:view", "pretrip:manage",
    "eligibility:view", "eligibility:manage",
    "content:view", "content:manage",
    "zones:view", "zones:manage",
    "chat:view", "chat:manage",
    "sos:view", "sos:manage",
    "ratings:view", "ratings:manage",
    "reports:view",
    "settings:view", "settings:manage",
  ],
  "operator": [
    "dashboard:view",
    "customers:view",
    "drivers:view", "drivers:manage",
    "vehicles:view", "vehicles:manage",
    "rides:view", "rides:manage",
    "tracking:view",
    "schedules:view", "schedules:manage",
    "pretrip:view", "pretrip:manage",
    "zones:view",
    "chat:view",
    "sos:view",
    "ratings:view",
  ],
  "support": [
    "dashboard:view",
    "customers:view",
    "drivers:view",
    "vehicles:view",
    "rides:view",
    "tracking:view",
    "schedules:view",
    "chat:view", "chat:manage",
    "sos:view", "sos:manage",
    "ratings:view", "ratings:manage",
  ],
  "viewer": [
    "dashboard:view",
    "customers:view",
    "drivers:view",
    "vehicles:view",
    "rides:view",
    "tracking:view",
    "schedules:view",
    "pretrip:view",
    "eligibility:view",
    "content:view",
    "zones:view",
    "chat:view",
    "sos:view",
    "ratings:view",
    "reports:view",
  ],
}

export function getPermissionsForRole(role: string): Permission[] {
  return ROLE_PERMISSIONS[role as Role] || []
}

export function hasPermission(role: string, permission: Permission): boolean {
  const permissions = getPermissionsForRole(role)
  return permissions.includes(permission)
}

export function hasAnyPermission(role: string, permissions: Permission[]): boolean {
  return permissions.some(p => hasPermission(role, p))
}

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  "super-admin": "Full system access including admin management",
  "admin": "Full operational access, cannot manage admins",
  "operator": "Manage rides, drivers, vehicles, schedules",
  "support": "Handle customer issues, chat, SOS, ratings",
  "viewer": "Read-only access to all data",
}
