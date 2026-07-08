// All available permissions in the system
export const ALL_PERMISSIONS = [
  "dashboard:view",
  "customers:view",
  "customers:manage",
  "drivers:view",
  "drivers:manage",
  "vehicles:view",
  "vehicles:manage",
  "rides:view",
  "rides:manage",
  "tracking:view",
  "schedules:view",
  "schedules:manage",
  "pretrip:view",
  "pretrip:manage",
  "eligibility:view",
  "eligibility:manage",
  "content:view",
  "content:manage",
  "zones:view",
  "zones:manage",
  "chat:view",
  "chat:manage",
  "sos:view",
  "sos:manage",
  "ratings:view",
  "ratings:manage",
  "reports:view",
  "reports:export",
  "admins:view",
  "admins:manage",
  "settings:view",
  "settings:manage",
] as const

export type Permission = typeof ALL_PERMISSIONS[number]

export type Role = "super-admin" | "admin" | "manager" | "operator" | "support" | "viewer"

// Permission categories for UI grouping
export const PERMISSION_CATEGORIES: Record<string, { label: string; permissions: Permission[] }> = {
  dashboard: {
    label: "Dashboard",
    permissions: ["dashboard:view"],
  },
  customers: {
    label: "Customers",
    permissions: ["customers:view", "customers:manage"],
  },
  drivers: {
    label: "Drivers",
    permissions: ["drivers:view", "drivers:manage"],
  },
  vehicles: {
    label: "Vehicles & Fleet",
    permissions: ["vehicles:view", "vehicles:manage", "pretrip:view", "pretrip:manage"],
  },
  rides: {
    label: "Rides & Operations",
    permissions: ["rides:view", "rides:manage", "tracking:view", "schedules:view", "schedules:manage"],
  },
  eligibility: {
    label: "Eligibility & Quotas",
    permissions: ["eligibility:view", "eligibility:manage"],
  },
  content: {
    label: "Content & Announcements",
    permissions: ["content:view", "content:manage"],
  },
  zones: {
    label: "Service Zones",
    permissions: ["zones:view", "zones:manage"],
  },
  communication: {
    label: "Communication",
    permissions: ["chat:view", "chat:manage"],
  },
  safety: {
    label: "Safety & Incidents",
    permissions: ["sos:view", "sos:manage"],
  },
  ratings: {
    label: "Ratings & Reviews",
    permissions: ["ratings:view", "ratings:manage"],
  },
  reports: {
    label: "Reports & Analytics",
    permissions: ["reports:view", "reports:export"],
  },
  admin: {
    label: "Administration",
    permissions: ["admins:view", "admins:manage", "settings:view", "settings:manage"],
  },
}

// Role-based default permissions
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  "super-admin": [...ALL_PERMISSIONS],

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
    "reports:view", "reports:export",
    "settings:view", "settings:manage",
    // No admins:manage - can't manage other admins
  ],

  "manager": [
    "dashboard:view",
    "customers:view", "customers:manage",
    "drivers:view", "drivers:manage",
    "vehicles:view", "vehicles:manage",
    "rides:view", "rides:manage",
    "tracking:view",
    "schedules:view", "schedules:manage",
    "pretrip:view", "pretrip:manage",
    "eligibility:view", "eligibility:manage",
    "zones:view",
    "chat:view",
    "sos:view", "sos:manage",
    "ratings:view", "ratings:manage",
    "reports:view", "reports:export",
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

export function hasAllPermissions(role: string, permissions: Permission[]): boolean {
  return permissions.every(p => hasPermission(role, p))
}

// Get display label for a permission
export function getPermissionLabel(permission: Permission): string {
  const [resource, action] = permission.split(":")
  const resourceLabels: Record<string, string> = {
    dashboard: "Dashboard",
    customers: "Customers",
    drivers: "Drivers",
    vehicles: "Vehicles",
    rides: "Rides",
    tracking: "Live Tracking",
    schedules: "Schedules",
    pretrip: "Pre-trip Checks",
    eligibility: "Eligibility",
    content: "Content",
    zones: "Service Zones",
    chat: "Chat",
    sos: "SOS & Incidents",
    ratings: "Ratings",
    reports: "Reports",
    admins: "Admins",
    settings: "Settings",
  }
  const actionLabels: Record<string, string> = {
    view: "View",
    manage: "Manage",
    export: "Export",
  }
  return `${actionLabels[action] || action} ${resourceLabels[resource] || resource}`
}

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  "super-admin": "Full system access including admin management and all settings",
  "admin": "Full operational access, cannot manage other admins",
  "manager": "Manage operations, reports, and most features except admin settings",
  "operator": "Day-to-day operations: rides, drivers, vehicles, schedules",
  "support": "Customer support: chat, SOS, ratings, view-only for most data",
  "viewer": "Read-only access to view all operational data",
}

export const ROLE_COLORS: Record<Role, string> = {
  "super-admin": "bg-red-500",
  "admin": "bg-orange-500",
  "manager": "bg-blue-500",
  "operator": "bg-green-500",
  "support": "bg-purple-500",
  "viewer": "bg-gray-500",
}
