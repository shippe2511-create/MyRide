"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"

const supabase = createClient()

// Dashboard stats
export function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [
        driversRes,
        customersRes,
        ridesRes,
        onlineRes,
        pendingDriversRes,
        pendingCustomersRes,
      ] = await Promise.all([
        supabase.from("drivers").select("*", { count: "exact", head: true }),
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "customer"),
        supabase.from("rides").select("*", { count: "exact", head: true }),
        supabase.from("drivers").select("*", { count: "exact", head: true }).eq("is_online", true),
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "driver").eq("status", "pending"),
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "customer").eq("status", "pending"),
      ])

      return {
        totalDrivers: driversRes.count || 0,
        totalCustomers: customersRes.count || 0,
        totalRides: ridesRes.count || 0,
        onlineDrivers: onlineRes.count || 0,
        pendingDrivers: pendingDriversRes.count || 0,
        pendingCustomers: pendingCustomersRes.count || 0,
      }
    },
  })
}

// Drivers list
export function useDrivers(status?: string) {
  return useQuery({
    queryKey: ["drivers", status],
    queryFn: async () => {
      let query = supabase
        .from("drivers")
        .select(`
          *,
          profile:profiles!drivers_profile_id_fkey(id, full_name, email, phone, avatar_url, status, employee_id, department),
          vehicle:vehicle_types(id, name, display_name, plate_no)
        `)
        .order("created_at", { ascending: false })

      if (status && status !== "all") {
        query = query.eq("profile.status", status)
      }

      const { data, error } = await query
      if (error) throw error
      return data || []
    },
  })
}

// Customers list
export function useCustomers(status?: string) {
  return useQuery({
    queryKey: ["customers", status],
    queryFn: async () => {
      let query = supabase
        .from("profiles")
        .select("*")
        .eq("role", "customer")
        .order("created_at", { ascending: false })

      if (status && status !== "all") {
        query = query.eq("status", status)
      }

      const { data, error } = await query
      if (error) throw error
      return data || []
    },
  })
}

// Rides list
export function useRides(status?: string) {
  return useQuery({
    queryKey: ["rides", status],
    queryFn: async () => {
      let query = supabase
        .from("rides")
        .select(`
          *,
          customer:profiles!rides_customer_id_fkey(id, full_name, phone),
          driver:drivers!rides_driver_id_fkey(
            id,
            profile:profiles!drivers_profile_id_fkey(id, full_name, phone)
          )
        `)
        .order("created_at", { ascending: false })
        .limit(100)

      if (status && status !== "all") {
        query = query.eq("status", status)
      }

      const { data, error } = await query
      if (error) throw error
      return data || []
    },
  })
}

// SOS alerts
export function useSOSAlerts(status?: string) {
  return useQuery({
    queryKey: ["sos-alerts", status],
    queryFn: async () => {
      let query = supabase
        .from("sos_alerts")
        .select(`
          *,
          profile:profiles(id, full_name, phone, role),
          driver:drivers(id, profile:profiles(id, full_name, phone))
        `)
        .order("created_at", { ascending: false })

      if (status && status !== "all") {
        query = query.eq("status", status)
      }

      const { data, error } = await query
      if (error) throw error
      return data || []
    },
  })
}

// Vehicles
export function useVehicles() {
  return useQuery({
    queryKey: ["vehicles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_types")
        .select("*")
        .order("display_name", { ascending: true })

      if (error) throw error
      return data || []
    },
  })
}

// Online drivers for tracking
export function useOnlineDrivers() {
  return useQuery({
    queryKey: ["online-drivers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drivers")
        .select(`
          *,
          profile:profiles!drivers_profile_id_fkey(id, full_name, phone, avatar_url),
          vehicle:vehicle_types(display_name, plate_no)
        `)
        .eq("is_online", true)

      if (error) throw error
      return data || []
    },
    refetchInterval: 10000, // Refetch every 10 seconds for live tracking
  })
}

// Invalidate queries helper
export function useInvalidateQueries() {
  const queryClient = useQueryClient()

  return {
    invalidateDrivers: () => queryClient.invalidateQueries({ queryKey: ["drivers"] }),
    invalidateCustomers: () => queryClient.invalidateQueries({ queryKey: ["customers"] }),
    invalidateRides: () => queryClient.invalidateQueries({ queryKey: ["rides"] }),
    invalidateSOSAlerts: () => queryClient.invalidateQueries({ queryKey: ["sos-alerts"] }),
    invalidateVehicles: () => queryClient.invalidateQueries({ queryKey: ["vehicles"] }),
    invalidateDashboard: () => queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] }),
    invalidateAll: () => queryClient.invalidateQueries(),
  }
}
