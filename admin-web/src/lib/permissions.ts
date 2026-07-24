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
  "pools:view",
  "pools:manage",
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
  "staff:view",
  "staff:manage",
  "departments:view",
  "departments:manage",
  "settings:view",
  "settings:manage",
  "audit:view",
] as const

export type Permission = typeof ALL_PERMISSIONS[number]

// 5-tier RBAC: super_admin > manager > operator > support > viewer
export type Role = "super_admin" | "manager" | "operator" | "support" | "viewer"

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
  pools: {
    label: "Service Pools",
    permissions: ["pools:view", "pools:manage"],
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
    permissions: ["staff:view", "staff:manage", "departments:view", "departments:manage", "settings:view", "settings:manage", "audit:view"],
  },
}

// Role-based default permissions - 3-tier system
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  // Super Admin: Full access including staff management and settings
  "super_admin": [...ALL_PERMISSIONS],

  // Manager: Operations (drivers, vehicles, pools, customers, reports). NO staff/settings
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
    "pools:view", "pools:manage",
    "content:view", "content:manage",
    "zones:view", "zones:manage",
    "chat:view",
    "sos:view", "sos:manage",
    "ratings:view", "ratings:manage",
    "reports:view", "reports:export",
    "audit:view",
  ],

  // Operator: Dispatch/support (view rides, live tracking, handle active trips). NO management
  "operator": [
    "dashboard:view",
    "customers:view",
    "drivers:view",
    "vehicles:view",
    "rides:view", "rides:manage", // Can cancel/reassign rides
    "tracking:view",
    "schedules:view",
    "pretrip:view",
    "pools:view",
    "content:view",
    "zones:view",
    "chat:view", "chat:manage", // Can respond to support chat
    "sos:view", "sos:manage", // Can handle SOS alerts
    "ratings:view",
  ],

  // Support: Customer support only (chat, SOS, ratings). NO dispatch or management
  "support": [
    "dashboard:view",
    "customers:view",
    "drivers:view",
    "rides:view",
    "tracking:view",
    "chat:view", "chat:manage", // Can respond to support chat
    "sos:view", "sos:manage", // Can handle SOS alerts
    "ratings:view", "ratings:manage", // Can manage ratings
  ],

  // Viewer: Read-only access to everything. NO actions
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
    "pools:view",
    "content:view",
    "zones:view",
    "chat:view",
    "sos:view",
    "ratings:view",
    "reports:view",
    "audit:view",
  ],
}

// Legacy role mapping for backwards compatibility during transition
const LEGACY_ROLE_MAP: Record<string, Role> = {
  "admin": "super_admin",
  "super-admin": "super_admin",
}

function normalizeRole(role: string): Role {
  if (role in LEGACY_ROLE_MAP) {
    return LEGACY_ROLE_MAP[role]
  }
  return role as Role
}

export function getPermissionsForRole(role: string): Permission[] {
  const normalizedRole = normalizeRole(role)
  return ROLE_PERMISSIONS[normalizedRole] || []
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
    pools: "Service Pools",
    content: "Content",
    zones: "Service Zones",
    chat: "Chat",
    sos: "SOS & Incidents",
    ratings: "Ratings",
    reports: "Reports",
    staff: "Staff",
    departments: "Departments",
    settings: "Settings",
    audit: "Audit Log",
  }
  const actionLabels: Record<string, string> = {
    view: "View",
    manage: "Manage",
    export: "Export",
  }
  return `${actionLabels[action] || action} ${resourceLabels[resource] || resource}`
}

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  "super_admin": "Full system access including staff management and all settings",
  "manager": "Manage operations: drivers, vehicles, pools, customers, reports. Cannot manage staff or settings.",
  "operator": "Dispatch & support: view rides, live tracking, handle active trips. Limited management access.",
  "support": "Customer support: chat, SOS alerts, ratings. No dispatch or management access.",
  "viewer": "Read-only access to all pages. Cannot make any changes.",
}

export const ROLE_COLORS: Record<Role, string> = {
  "super_admin": "bg-red-500",
  "manager": "bg-blue-500",
  "operator": "bg-green-500",
  "support": "bg-purple-500",
  "viewer": "bg-gray-500",
}

export const ROLE_LABELS: Record<Role, string> = {
  "super_admin": "Super Admin",
  "manager": "Manager",
  "operator": "Operator",
  "support": "Support",
  "viewer": "Viewer",
}

// All valid staff roles
export const STAFF_ROLES: Role[] = ["super_admin", "manager", "operator", "support", "viewer"]
