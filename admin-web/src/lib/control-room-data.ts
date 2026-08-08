/**
 * Control Room Data Layer
 *
 * All data fetching and realtime subscriptions for the Transport Operations Dashboard.
 * Uses Supabase realtime subscriptions (NOT polling) for live updates.
 */

import { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js'

// ============================================================================
// TYPES
// ============================================================================

export interface ActiveTrip {
  id: string
  customer_id: string
  driver_id: string | null
  pickup_name: string
  dropoff_name: string
  status: 'pending' | 'accepted' | 'arrived' | 'in_progress' | 'completed' | 'cancelled'
  created_at: string      // requested
  accepted_at: string | null
  arrived_at: string | null  // driver arrived at pickup
  started_at: string | null  // trip started
  completed_at: string | null
  cancelled_at: string | null
  cancel_reason: string | null
  // Joined data
  customer?: {
    full_name: string
    phone: string
    department_id: string | null
    department?: { name: string } | null
  }
  driver?: {
    profile?: { full_name: string }
    vehicle_id: string | null
    vehicle?: { vehicle_number: string }
  }
}

export interface ActiveShuttle {
  id: string
  trip_id: string
  driver_id: string
  vehicle_id: string
  route_id: string
  current_stop_name: string
  current_stop_index: number
  passengers_on_board: number
  vehicle_capacity: number
  is_full: boolean
  status: string
  vehicle_number: string
  last_updated_at: string
  latitude: number | null
  longitude: number | null
  bearing: number | null
  // Joined data
  route?: { route_name: string; route_code: string }
  driver_name?: string
  total_stops?: number
  has_backup_assigned?: boolean
}

export interface DriverStatus {
  id: string
  profile_id: string
  is_online: boolean
  is_on_break: boolean
  break_type: string | null
  break_start_time: string | null
  vehicle_id: string | null
  department_id: string | null
  profile?: { full_name: string }
  vehicle?: { vehicle_number: string }
  // Shift info
  shift_end_time?: string | null
}

export interface TodayStats {
  completed_trips: number
  cancelled_trips: number
  cancelled_by_customer: number
  cancelled_by_driver: number
  total_requests: number
  // For computing averages
  trips_with_times: {
    created_at: string
    accepted_at: string | null
    arrived_at: string | null
    started_at: string | null
    completed_at: string | null
  }[]
}

export interface YesterdayStats {
  completed_trips: number
  cancelled_trips: number
  avg_accept_seconds: number
  avg_arrival_seconds: number
  avg_duration_seconds: number
}

export interface RosterGap {
  departure_time: string
  route_name: string
  route_id: string
}

export interface DriverSuggestion {
  driver_id: string
  driver_name: string
  vehicle_number: string
  distance_km: number
  eta_minutes: number
  rating: number
  trips_today: number
  shift_minutes_remaining: number | null
  score: number // computed score (higher = better)
}

export interface DriverLocation {
  driver_id: string
  lat: number
  lng: number
  heading: number | null
  is_online: boolean
  last_updated: string
  driver_name?: string
  vehicle_number?: string
  vehicle_capacity?: number | null
  active_ride_id?: string | null
  active_ride_status?: string | null
}

export interface MapMarker {
  id: string
  type: 'taxi' | 'shuttle'
  lat: number
  lng: number
  heading?: number
  status: string
  label: string
  sublabel?: string
  isAlert?: boolean
  passengersOnBoard?: number
  vehicleCapacity?: number
  isFull?: boolean
}

export interface PickupMarker {
  lat: number
  lng: number
  tripId: string
}

export interface HourlyTrend {
  hour: number
  requests: number
  completed: number
  cancelled: number
}

export interface SOSAlert {
  id: string
  user_id: string
  ride_id: string | null
  status: string
  created_at: string
  location_lat: number | null
  location_lng: number | null
  user_name?: string
  user_phone?: string
}

export interface ShiftWarning {
  driver_id: string
  driver_name: string
  shift_end_time: string
  minutes_remaining: number
  has_active_ride: boolean
}

export interface ScheduledRide {
  id: string
  customer_name: string
  pickup_name: string
  scheduled_time: string
  minutes_until: number
}

export interface RecentRating {
  id: string
  rating: number
  comment: string | null
  created_at: string
  customer_name: string
  driver_name: string
}

export interface ComputedMetrics {
  activeTrips: number
  awaitingDriver: number
  avgAcceptSeconds: number
  avgArrivalSeconds: number
  avgDurationSeconds: number
  avgCustomerWaitSeconds: number
  onTimeArrivalPercent: number
  cancellationRate: number
  cancellationByCustomer: number
  cancellationByDriver: number
  vehicleUtilisationPercent: number
  shuttlesRunning: number
  completedToday: number
  // Deltas vs yesterday
  completedDelta: number
  avgAcceptDelta: number
  avgArrivalDelta: number
  avgDurationDelta: number
  // Attention items
  oldestUnassignedSeconds: number
  oldestUnassignedId: string | null
  shuttlesNearCapacity: number
  rosterGaps: number
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get active taxi trips (pending, accepted, arrived, in_progress)
 * Respects department permissions if departmentId is provided
 */
export async function getActiveTrips(
  supabase: SupabaseClient,
  departmentId?: string | null
): Promise<ActiveTrip[]> {
  // Only fetch truly active trips (not completed/cancelled)
  let query = supabase
    .from('rides')
    .select(`
      id, customer_id, driver_id, pickup_name, dropoff_name, status,
      created_at, accepted_at, arrived_at, started_at, completed_at, cancelled_at, cancel_reason,
      customer:profiles!rides_customer_id_fkey(
        full_name, phone, department_id,
        department:departments(name)
      ),
      driver:drivers!rides_driver_id_fkey(
        profile:profiles(full_name),
        vehicle_id,
        vehicle:vehicles(vehicle_number, vehicle_model)
      )
    `)
    .in('status', ['pending', 'accepted', 'arrived', 'in_progress'])
    .order('created_at', { ascending: true })

  const { data, error } = await query

  if (error) {
    console.error('Error fetching active trips:', error)
    return []
  }

  // Transform Supabase nested arrays to single objects
  let trips = (data || []).map((row: any) => ({
    ...row,
    customer: Array.isArray(row.customer) ? row.customer[0] : row.customer,
    driver: Array.isArray(row.driver) ? row.driver[0] : row.driver,
  })) as ActiveTrip[]

  // Flatten nested department
  trips = trips.map(t => ({
    ...t,
    customer: t.customer ? {
      ...t.customer,
      department: Array.isArray(t.customer.department) ? t.customer.department[0] : t.customer.department
    } : undefined,
    driver: t.driver ? {
      ...t.driver,
      profile: Array.isArray((t.driver as any).profile) ? (t.driver as any).profile[0] : (t.driver as any).profile,
      vehicle: Array.isArray((t.driver as any).vehicle) ? (t.driver as any).vehicle[0] : (t.driver as any).vehicle,
    } : undefined,
  }))

  // Filter by department if not super admin
  if (departmentId) {
    trips = trips.filter(t => t.customer?.department_id === departmentId)
  }

  return trips
}

/**
 * Get recently completed trips (last 10, completed today)
 */
export async function getRecentlyCompletedTrips(
  supabase: SupabaseClient,
  departmentId?: string | null
): Promise<ActiveTrip[]> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  let query = supabase
    .from('rides')
    .select(`
      id, customer_id, driver_id, pickup_name, dropoff_name, status,
      created_at, accepted_at, arrived_at, started_at, completed_at, cancelled_at, cancel_reason,
      customer:profiles!rides_customer_id_fkey(
        full_name, phone, department_id,
        department:departments(name)
      ),
      driver:drivers!rides_driver_id_fkey(
        profile:profiles(full_name),
        vehicle_id,
        vehicle:vehicles(vehicle_number)
      )
    `)
    .eq('status', 'completed')
    .gte('completed_at', today.toISOString())
    .order('completed_at', { ascending: false })
    .limit(10)

  const { data, error } = await query

  if (error) {
    console.error('Error fetching recently completed trips:', error)
    return []
  }

  let trips = (data || []).map((row: any) => ({
    ...row,
    customer: Array.isArray(row.customer) ? row.customer[0] : row.customer,
    driver: Array.isArray(row.driver) ? row.driver[0] : row.driver,
  })) as ActiveTrip[]

  trips = trips.map(t => ({
    ...t,
    customer: t.customer ? {
      ...t.customer,
      department: Array.isArray(t.customer.department) ? t.customer.department[0] : t.customer.department
    } : undefined,
    driver: t.driver ? {
      ...t.driver,
      profile: Array.isArray((t.driver as any).profile) ? (t.driver as any).profile[0] : (t.driver as any).profile,
      vehicle: Array.isArray((t.driver as any).vehicle) ? (t.driver as any).vehicle[0] : (t.driver as any).vehicle,
    } : undefined,
  }))

  if (departmentId) {
    trips = trips.filter(t => t.customer?.department_id === departmentId)
  }

  return trips
}

/**
 * Saved location for zone matching
 */
export interface ServiceZone {
  name: string
  keywords: string[]
  priority: number
}

/**
 * Get active saved locations for zone matching (uses locations table)
 */
export async function getServiceZones(
  supabase: SupabaseClient
): Promise<ServiceZone[]> {
  const { data, error } = await supabase
    .from('locations')
    .select('name')
    .eq('is_active', true)
    .order('name')

  if (error) {
    console.error('Error fetching locations:', error)
    return []
  }

  // Each location name is its own keyword (lowercase)
  return (data || []).map((loc, i) => ({
    name: loc.name,
    keywords: [loc.name.toLowerCase()],
    priority: i + 1
  }))
}

/**
 * Get today's trips for zone analysis (all trips from today with pickup locations)
 */
export async function getTodayTripsForZones(
  supabase: SupabaseClient,
  departmentId?: string | null
): Promise<{ pickup_name: string | null; status: string }[]> {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  let query = supabase
    .from('rides')
    .select(`
      pickup_name, status,
      customer:profiles!rides_customer_id_fkey(department_id)
    `)
    .gte('created_at', todayStart.toISOString())
    .not('status', 'eq', 'cancelled')

  const { data, error } = await query

  if (error) {
    console.error('Error fetching today trips for zones:', error)
    return []
  }

  let trips = data || []

  if (departmentId) {
    trips = trips.filter((t: any) => t.customer?.department_id === departmentId)
  }

  return trips.map((t: any) => ({
    pickup_name: t.pickup_name,
    status: t.status
  }))
}

/**
 * Get active shuttle/bus trips
 */
export async function getActiveShuttles(
  supabase: SupabaseClient
): Promise<ActiveShuttle[]> {
  const { data, error } = await supabase
    .from('bus_location_tracking')
    .select(`
      id, trip_id, driver_id, vehicle_id, route_id,
      current_stop_name, current_stop_index, passengers_on_board,
      vehicle_capacity, is_full, status, vehicle_number, last_updated_at,
      latitude, longitude, bearing,
      route:transport_routes(route_name, route_code),
      driver:drivers!bus_location_tracking_driver_id_fkey(
        profile:profiles(full_name)
      )
    `)
    .in('status', ['active', 'in_progress'])
    .order('vehicle_number', { ascending: true })

  if (error) {
    console.error('Error fetching active shuttles:', error)
    return []
  }

  // Transform Supabase nested arrays to single objects
  const shuttles = (data || []).map((row: any) => {
    const route = Array.isArray(row.route) ? row.route[0] : row.route
    const driver = Array.isArray(row.driver) ? row.driver[0] : row.driver
    const profile = driver?.profile ? (Array.isArray(driver.profile) ? driver.profile[0] : driver.profile) : null
    return {
      ...row,
      route,
      driver_name: profile?.full_name || null,
    }
  }) as ActiveShuttle[]

  // Fetch stop counts for routes
  const routeIds = [...new Set(shuttles.map(s => s.route_id))]
  if (routeIds.length > 0) {
    const { data: stopCounts } = await supabase
      .from('route_stops')
      .select('route_id')
      .in('route_id', routeIds)

    const countByRoute: Record<string, number> = {}
    const stops = stopCounts as { route_id: string }[] | null
    ;(stops || []).forEach((s) => {
      countByRoute[s.route_id] = (countByRoute[s.route_id] || 0) + 1
    })

    shuttles.forEach(s => {
      s.total_stops = countByRoute[s.route_id] || 0
    })
  }

  // Check for backup assignments for FULL shuttles - query roster_assignments directly
  const fullShuttleTripIds = shuttles.filter(s => s.is_full).map(s => s.trip_id)
  if (fullShuttleTripIds.length > 0) {
    const { data: backupAssignments } = await supabase
      .from('roster_assignments')
      .select('backup_for_trip_id')
      .in('backup_for_trip_id', fullShuttleTripIds)
      .eq('is_backup', true)

    const tripsWithBackup = new Set<string>(
      (backupAssignments || [])
        .map(ra => ra.backup_for_trip_id)
        .filter(Boolean) as string[]
    )

    shuttles.forEach(s => {
      s.has_backup_assigned = tripsWithBackup.has(s.trip_id)
    })
  }

  return shuttles
}

/**
 * Get fleet status - all drivers with their online/break status
 */
export async function getFleetStatus(
  supabase: SupabaseClient,
  departmentId?: string | null
): Promise<DriverStatus[]> {
  const today = new Date().toISOString().split('T')[0]

  let query = supabase
    .from('drivers')
    .select(`
      id, profile_id, is_online, is_on_break, break_type, break_start_time,
      vehicle_id, department_id,
      profile:profiles(full_name),
      vehicle:vehicles(vehicle_number)
    `)

  const { data: drivers, error } = await query

  if (error) {
    console.error('Error fetching fleet status:', error)
    return []
  }

  // Transform Supabase nested arrays to single objects
  let fleet = (drivers || []).map((row: any) => ({
    ...row,
    profile: Array.isArray(row.profile) ? row.profile[0] : row.profile,
    vehicle: Array.isArray(row.vehicle) ? row.vehicle[0] : row.vehicle,
  })) as DriverStatus[]

  // Filter by department if not super admin
  if (departmentId) {
    fleet = fleet.filter(d => d.department_id === departmentId)
  }

  // Get today's shifts to determine shift end times
  const driverIds = fleet.map(d => d.id)
  if (driverIds.length > 0) {
    const { data: shifts } = await supabase
      .from('shifts')
      .select('driver_id, end_time')
      .eq('shift_date', today)
      .in('driver_id', driverIds)
      .in('status', ['active', 'scheduled'])

    const shiftMap: Record<string, string> = {}
    ;(shifts || []).forEach((s: { driver_id: string; end_time: string }) => {
      shiftMap[s.driver_id] = s.end_time
    })

    fleet.forEach(d => {
      d.shift_end_time = shiftMap[d.id] || null
    })
  }

  return fleet
}

/**
 * Get smart dispatch suggestions for a pending trip
 * Returns ranked list of available drivers based on proximity, rating, and shift time
 */
export async function getDispatchSuggestions(
  supabase: SupabaseClient,
  tripId: string,
  pickupLat: number,
  pickupLng: number
): Promise<DriverSuggestion[]> {
  const today = new Date().toISOString().split('T')[0]

  // Get available drivers (online, not on break, no active ride)
  const { data: availableDrivers } = await supabase
    .from('drivers')
    .select(`
      id, profile_id, is_online, is_on_break,
      profile:profiles(full_name, rating),
      vehicle:vehicles(vehicle_number)
    `)
    .eq('is_online', true)
    .eq('is_on_break', false)

  if (!availableDrivers || availableDrivers.length === 0) return []

  // Get drivers with active rides (to exclude them)
  const { data: activeRides } = await supabase
    .from('rides')
    .select('driver_id')
    .in('status', ['accepted', 'arrived', 'in_progress'])

  const busyDriverIds = new Set((activeRides || []).map((r: any) => r.driver_id))

  // Get driver locations
  const driverIds = availableDrivers.map((d: any) => d.id)
  const { data: locations } = await supabase
    .from('driver_locations')
    .select('driver_id, lat, lng')
    .in('driver_id', driverIds)
    .eq('is_online', true)

  const locationMap: Record<string, { lat: number; lng: number }> = {}
  ;(locations || []).forEach((loc: any) => {
    locationMap[loc.driver_id] = { lat: parseFloat(loc.lat), lng: parseFloat(loc.lng) }
  })

  // Get today's shifts for shift time remaining
  const { data: shifts } = await supabase
    .from('shifts')
    .select('driver_id, end_time')
    .eq('shift_date', today)
    .in('driver_id', driverIds)

  const shiftMap: Record<string, string> = {}
  ;(shifts || []).forEach((s: any) => {
    shiftMap[s.driver_id] = s.end_time
  })

  // Get today's trip counts
  const { data: tripCounts } = await supabase
    .from('rides')
    .select('driver_id')
    .eq('status', 'completed')
    .gte('completed_at', `${today}T00:00:00`)
    .in('driver_id', driverIds)

  const tripCountMap: Record<string, number> = {}
  ;(tripCounts || []).forEach((t: any) => {
    tripCountMap[t.driver_id] = (tripCountMap[t.driver_id] || 0) + 1
  })

  // Calculate suggestions
  const suggestions: DriverSuggestion[] = []

  for (const driver of availableDrivers as any[]) {
    // Skip busy drivers
    if (busyDriverIds.has(driver.id)) continue

    const location = locationMap[driver.id]
    if (!location) continue // No location data

    const profile = Array.isArray(driver.profile) ? driver.profile[0] : driver.profile
    const vehicle = Array.isArray(driver.vehicle) ? driver.vehicle[0] : driver.vehicle

    if (!vehicle) continue // No vehicle assigned

    // Calculate distance (Haversine formula)
    const R = 6371 // Earth's radius in km
    const dLat = (location.lat - pickupLat) * Math.PI / 180
    const dLng = (location.lng - pickupLng) * Math.PI / 180
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(pickupLat * Math.PI / 180) * Math.cos(location.lat * Math.PI / 180) *
              Math.sin(dLng / 2) ** 2
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    const distance_km = R * c

    // Estimate ETA (assume 30 km/h average speed in traffic)
    const eta_minutes = Math.round((distance_km / 30) * 60)

    // Get shift time remaining
    let shift_minutes_remaining: number | null = null
    if (shiftMap[driver.id]) {
      const [hours, minutes] = shiftMap[driver.id].split(':').map(Number)
      const now = new Date()
      const shiftEnd = new Date()
      shiftEnd.setHours(hours, minutes, 0, 0)
      shift_minutes_remaining = Math.max(0, Math.round((shiftEnd.getTime() - now.getTime()) / 60000))
    }

    const rating = profile?.rating || 5.0
    const trips_today = tripCountMap[driver.id] || 0

    // Calculate score (higher = better)
    // Factors: proximity (most important), rating, shift time remaining
    let score = 100

    // Distance penalty: -10 points per km
    score -= distance_km * 10

    // Rating bonus: +5 points per star above 3
    score += (rating - 3) * 5

    // Shift time penalty: -20 if less than 30 minutes remaining
    if (shift_minutes_remaining !== null && shift_minutes_remaining < 30) {
      score -= 20
    }

    // Experience bonus: +1 point per completed trip today (up to 5)
    score += Math.min(trips_today, 5)

    suggestions.push({
      driver_id: driver.id,
      driver_name: profile?.full_name || 'Unknown',
      vehicle_number: vehicle?.vehicle_number || 'N/A',
      distance_km: Math.round(distance_km * 10) / 10,
      eta_minutes,
      rating: Math.round(rating * 10) / 10,
      trips_today,
      shift_minutes_remaining,
      score: Math.round(score),
    })
  }

  // Sort by score (highest first)
  suggestions.sort((a, b) => b.score - a.score)

  // Return top 5
  return suggestions.slice(0, 5)
}

/**
 * Get driver locations for map display
 */
export async function getDriverLocations(
  supabase: SupabaseClient,
  departmentId?: string | null
): Promise<DriverLocation[]> {
  // Get online drivers directly from drivers table (source of truth)
  const { data: onlineDrivers, error: driversError } = await supabase
    .from('drivers')
    .select(`
      id, department_id, is_online,
      profile:profiles(full_name),
      vehicle:vehicles(vehicle_number, vehicle_type)
    `)
    .eq('is_online', true)

  if (driversError) {
    console.error('Error fetching online drivers:', driversError)
    return []
  }

  if (!onlineDrivers || onlineDrivers.length === 0) {
    return []
  }

  // Get locations for online drivers
  const onlineDriverIds = onlineDrivers.map((d: any) => d.id)
  const { data: locations, error: locError } = await supabase
    .from('driver_locations')
    .select('driver_id, lat, lng, heading, last_updated')
    .in('driver_id', onlineDriverIds)

  if (locError) {
    console.error('Error fetching driver locations:', locError)
    return []
  }

  // Get active rides
  const { data: activeRides } = await supabase
    .from('rides')
    .select('id, driver_id, status')
    .in('status', ['accepted', 'arrived', 'in_progress'])

  const rideByDriver: Record<string, { id: string; status: string }> = {}
  ;(activeRides || []).forEach((r: any) => {
    if (r.driver_id) rideByDriver[r.driver_id] = { id: r.id, status: r.status }
  })

  // Build driver info map
  const driverInfo: Record<string, any> = {}
  onlineDrivers.forEach((d: any) => {
    const profile = Array.isArray(d.profile) ? d.profile[0] : d.profile
    const vehicle = Array.isArray(d.vehicle) ? d.vehicle[0] : d.vehicle
    driverInfo[d.id] = {
      driver_name: profile?.full_name || 'Unknown',
      vehicle_number: vehicle?.vehicle_number || null,
      vehicle_capacity: null, // Not used for taxi drivers
      department_id: d.department_id,
    }
  })

  // Transform locations
  let result = (locations || []).map((loc: any) => {
    const info = driverInfo[loc.driver_id] || {}
    const activeRide = rideByDriver[loc.driver_id]
    return {
      driver_id: loc.driver_id,
      lat: parseFloat(loc.lat),
      lng: parseFloat(loc.lng),
      heading: loc.heading ? parseFloat(loc.heading) : null,
      is_online: true,
      last_updated: loc.last_updated,
      driver_name: info.driver_name || 'Unknown',
      vehicle_number: info.vehicle_number,
      vehicle_capacity: info.vehicle_capacity,
      department_id: info.department_id,
      active_ride_id: activeRide?.id || null,
      active_ride_status: activeRide?.status || null,
    }
  }) as (DriverLocation & { department_id?: string })[]

  // Filter by department if needed
  if (departmentId) {
    result = result.filter(l => l.department_id === departmentId)
  }

  return result
}

/**
 * Build map markers from trips, shuttles, and driver locations
 */
export function buildMapMarkers(
  trips: ActiveTrip[],
  shuttles: ActiveShuttle[],
  driverLocations: DriverLocation[]
): { markers: MapMarker[]; pickups: PickupMarker[] } {
  const markers: MapMarker[] = []
  const pickups: PickupMarker[] = []

  // Add taxi driver markers with their current status
  driverLocations.forEach(loc => {
    const status = loc.active_ride_status || 'available'
    markers.push({
      id: loc.driver_id,
      type: 'taxi',
      lat: loc.lat,
      lng: loc.lng,
      status,
      label: loc.driver_name?.split(' ')[0] || 'Driver',
      sublabel: loc.vehicle_number || undefined,
      isAlert: false,
    })
  })

  // Add shuttle markers
  shuttles.forEach(shuttle => {
    markers.push({
      id: shuttle.id,
      type: 'shuttle',
      lat: parseFloat(String(shuttle.route_id)), // Will need actual lat/lng
      lng: 0,
      status: shuttle.is_full ? 'full' : shuttle.status,
      label: shuttle.route?.route_code || 'Bus',
      sublabel: `${shuttle.passengers_on_board}/${shuttle.vehicle_capacity}`,
      isAlert: shuttle.is_full,
    })
  })

  return { markers, pickups }
}

/**
 * Get today's statistics for metrics calculation
 */
export async function getTodayStats(
  supabase: SupabaseClient,
  departmentId?: string | null
): Promise<TodayStats> {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayISO = todayStart.toISOString()

  // Get all rides from today
  let query = supabase
    .from('rides')
    .select(`
      id, status, created_at, accepted_at, arrived_at, started_at, completed_at, cancel_reason,
      customer:profiles!rides_customer_id_fkey(department_id)
    `)
    .gte('created_at', todayISO)

  const { data, error } = await query

  if (error) {
    console.error('Error fetching today stats:', error)
    return {
      completed_trips: 0,
      cancelled_trips: 0,
      cancelled_by_customer: 0,
      cancelled_by_driver: 0,
      total_requests: 0,
      trips_with_times: []
    }
  }

  let rides = data || []

  // Filter by department if needed
  if (departmentId) {
    rides = rides.filter((r: any) => r.customer?.department_id === departmentId)
  }

  const completed = rides.filter((r: any) => r.status === 'completed')
  const cancelled = rides.filter((r: any) => r.status === 'cancelled')
  const cancelledByCustomer = cancelled.filter((r: any) =>
    r.cancel_reason?.toLowerCase().includes('customer') ||
    r.cancel_reason?.toLowerCase().includes('rider')
  )
  const cancelledByDriver = cancelled.filter((r: any) =>
    r.cancel_reason?.toLowerCase().includes('driver')
  )

  return {
    completed_trips: completed.length,
    cancelled_trips: cancelled.length,
    cancelled_by_customer: cancelledByCustomer.length,
    cancelled_by_driver: cancelledByDriver.length,
    total_requests: rides.length,
    trips_with_times: completed.map((r: any) => ({
      created_at: r.created_at,
      accepted_at: r.accepted_at,
      arrived_at: r.arrived_at,
      started_at: r.started_at,
      completed_at: r.completed_at
    }))
  }
}

/**
 * Get yesterday's statistics for delta comparison
 */
export async function getYesterdayStats(
  supabase: SupabaseClient,
  departmentId?: string | null
): Promise<YesterdayStats> {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  yesterday.setHours(0, 0, 0, 0)
  const yesterdayStart = yesterday.toISOString()

  const yesterdayEnd = new Date(yesterday)
  yesterdayEnd.setHours(23, 59, 59, 999)
  const yesterdayEndISO = yesterdayEnd.toISOString()

  let query = supabase
    .from('rides')
    .select(`
      id, status, created_at, accepted_at, arrived_at, started_at, completed_at,
      customer:profiles!rides_customer_id_fkey(department_id)
    `)
    .gte('created_at', yesterdayStart)
    .lte('created_at', yesterdayEndISO)

  const { data, error } = await query

  if (error) {
    console.error('Error fetching yesterday stats:', error)
    return {
      completed_trips: 0,
      cancelled_trips: 0,
      avg_accept_seconds: 0,
      avg_arrival_seconds: 0,
      avg_duration_seconds: 0
    }
  }

  let rides = data || []

  if (departmentId) {
    rides = rides.filter((r: any) => r.customer?.department_id === departmentId)
  }

  const completed = rides.filter((r: any) => r.status === 'completed')
  const cancelled = rides.filter((r: any) => r.status === 'cancelled')

  // Calculate averages
  let totalAccept = 0, countAccept = 0
  let totalArrival = 0, countArrival = 0
  let totalDuration = 0, countDuration = 0

  completed.forEach((r: any) => {
    if (r.created_at && r.accepted_at) {
      totalAccept += (new Date(r.accepted_at).getTime() - new Date(r.created_at).getTime()) / 1000
      countAccept++
    }
    if (r.accepted_at && r.arrived_at) {
      totalArrival += (new Date(r.arrived_at).getTime() - new Date(r.accepted_at).getTime()) / 1000
      countArrival++
    }
    if (r.started_at && r.completed_at) {
      totalDuration += (new Date(r.completed_at).getTime() - new Date(r.started_at).getTime()) / 1000
      countDuration++
    }
  })

  return {
    completed_trips: completed.length,
    cancelled_trips: cancelled.length,
    avg_accept_seconds: countAccept > 0 ? totalAccept / countAccept : 0,
    avg_arrival_seconds: countArrival > 0 ? totalArrival / countArrival : 0,
    avg_duration_seconds: countDuration > 0 ? totalDuration / countDuration : 0
  }
}

/**
 * Get roster gaps - scheduled departures without driver assignment
 */
export async function getRosterGaps(
  supabase: SupabaseClient
): Promise<RosterGap[]> {
  const today = new Date().toISOString().split('T')[0]
  const now = new Date().toTimeString().slice(0, 8) // HH:MM:SS

  const { data, error } = await supabase
    .from('roster_assignments')
    .select(`
      departure_time, route_id,
      route:transport_routes(route_name)
    `)
    .eq('service_date', today)
    .is('driver_id', null)
    .gte('departure_time', now)
    .order('departure_time', { ascending: true })
    .limit(10)

  if (error) {
    console.error('Error fetching roster gaps:', error)
    return []
  }

  return (data || []).map((r: any) => ({
    departure_time: r.departure_time,
    route_name: r.route?.route_name || 'Unknown',
    route_id: r.route_id
  }))
}

/**
 * Get hourly trip trends for today (for mini sparkline charts)
 */
export async function getHourlyTrends(
  supabase: SupabaseClient,
  departmentId?: string | null
): Promise<HourlyTrend[]> {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayISO = todayStart.toISOString()

  const { data, error } = await supabase
    .from('rides')
    .select(`
      id, status, created_at,
      customer:profiles!rides_customer_id_fkey(department_id)
    `)
    .gte('created_at', todayISO)

  if (error) {
    console.error('Error fetching hourly trends:', error)
    return []
  }

  let rides = data || []

  if (departmentId) {
    rides = rides.filter((r: any) => r.customer?.department_id === departmentId)
  }

  // Group by hour
  const hourlyData: Record<number, { requests: number; completed: number; cancelled: number }> = {}

  // Initialize all hours up to current
  const currentHour = new Date().getHours()
  for (let h = 0; h <= currentHour; h++) {
    hourlyData[h] = { requests: 0, completed: 0, cancelled: 0 }
  }

  rides.forEach((r: any) => {
    const hour = new Date(r.created_at).getHours()
    if (!hourlyData[hour]) {
      hourlyData[hour] = { requests: 0, completed: 0, cancelled: 0 }
    }
    hourlyData[hour].requests++
    if (r.status === 'completed') hourlyData[hour].completed++
    if (r.status === 'cancelled') hourlyData[hour].cancelled++
  })

  return Object.entries(hourlyData)
    .map(([hour, data]) => ({
      hour: parseInt(hour),
      ...data
    }))
    .sort((a, b) => a.hour - b.hour)
}

/**
 * Get active SOS alerts
 */
export async function getSOSAlerts(
  supabase: SupabaseClient
): Promise<SOSAlert[]> {
  const { data, error } = await supabase
    .from('sos_alerts')
    .select(`
      id, user_id, ride_id, status, created_at, location_lat, location_lng,
      user:profiles!sos_alerts_user_id_fkey(full_name, phone)
    `)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) {
    console.error('Error fetching SOS alerts:', error)
    return []
  }

  return (data || []).map((row: any) => {
    const user = Array.isArray(row.user) ? row.user[0] : row.user
    return {
      id: row.id,
      user_id: row.user_id,
      ride_id: row.ride_id,
      status: row.status,
      created_at: row.created_at,
      location_lat: row.location_lat,
      location_lng: row.location_lng,
      user_name: user?.full_name || 'Unknown',
      user_phone: user?.phone || null
    }
  })
}

/**
 * Get drivers whose shifts end soon (within 30 minutes)
 */
export async function getShiftWarnings(
  supabase: SupabaseClient,
  departmentId?: string | null
): Promise<ShiftWarning[]> {
  const today = new Date().toISOString().split('T')[0]
  const now = new Date()
  const nowTime = now.toTimeString().slice(0, 8)
  const soon = new Date(now.getTime() + 30 * 60 * 1000)
  const soonTime = soon.toTimeString().slice(0, 8)

  const { data, error } = await supabase
    .from('shifts')
    .select(`
      driver_id, end_time,
      driver:drivers!shifts_driver_id_fkey(
        id, department_id,
        profile:profiles(full_name)
      )
    `)
    .eq('shift_date', today)
    .in('status', ['active', 'scheduled'])
    .gte('end_time', nowTime)
    .lte('end_time', soonTime)

  if (error) {
    console.error('Error fetching shift warnings:', error)
    return []
  }

  // Get active rides to check if driver has active ride
  const { data: activeRides } = await supabase
    .from('rides')
    .select('driver_id')
    .in('status', ['accepted', 'arrived', 'in_progress'])

  const driversWithRides = new Set((activeRides || []).map((r: any) => r.driver_id))

  let warnings = (data || []).map((row: any) => {
    const driver = Array.isArray(row.driver) ? row.driver[0] : row.driver
    const profile = driver?.profile ? (Array.isArray(driver.profile) ? driver.profile[0] : driver.profile) : null
    const endTime = row.end_time
    const [h, m] = endTime.split(':').map(Number)
    const shiftEnd = new Date()
    shiftEnd.setHours(h, m, 0, 0)
    const minutesRemaining = Math.max(0, Math.round((shiftEnd.getTime() - now.getTime()) / 60000))

    return {
      driver_id: row.driver_id,
      driver_name: profile?.full_name || 'Unknown',
      shift_end_time: endTime,
      minutes_remaining: minutesRemaining,
      has_active_ride: driversWithRides.has(row.driver_id),
      department_id: driver?.department_id
    }
  }) as (ShiftWarning & { department_id?: string })[]

  if (departmentId) {
    warnings = warnings.filter(w => w.department_id === departmentId)
  }

  return warnings.sort((a, b) => a.minutes_remaining - b.minutes_remaining)
}

/**
 * Get scheduled rides coming up in next 2 hours
 */
export async function getScheduledRides(
  supabase: SupabaseClient,
  departmentId?: string | null
): Promise<ScheduledRide[]> {
  const now = new Date()
  const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000)

  const { data, error } = await supabase
    .from('rides')
    .select(`
      id, pickup_name, scheduled_pickup_time,
      customer:profiles!rides_customer_id_fkey(full_name, department_id)
    `)
    .eq('status', 'scheduled')
    .gte('scheduled_pickup_time', now.toISOString())
    .lte('scheduled_pickup_time', twoHoursLater.toISOString())
    .order('scheduled_pickup_time', { ascending: true })
    .limit(10)

  if (error) {
    console.error('Error fetching scheduled rides:', error)
    return []
  }

  let rides = (data || []).map((row: any) => {
    const customer = Array.isArray(row.customer) ? row.customer[0] : row.customer
    const scheduledTime = new Date(row.scheduled_pickup_time)
    const minutesUntil = Math.round((scheduledTime.getTime() - now.getTime()) / 60000)

    return {
      id: row.id,
      customer_name: customer?.full_name || 'Unknown',
      pickup_name: row.pickup_name,
      scheduled_time: row.scheduled_pickup_time,
      minutes_until: minutesUntil,
      department_id: customer?.department_id
    }
  }) as (ScheduledRide & { department_id?: string })[]

  if (departmentId) {
    rides = rides.filter(r => r.department_id === departmentId)
  }

  return rides
}

/**
 * Get recent ratings (last 10)
 */
export async function getRecentRatings(
  supabase: SupabaseClient
): Promise<RecentRating[]> {
  const { data, error } = await supabase
    .from('ratings')
    .select(`
      id, rating, comment, created_at,
      ride:rides!ratings_ride_id_fkey(
        customer:profiles!rides_customer_id_fkey(full_name),
        driver:drivers!rides_driver_id_fkey(
          profile:profiles(full_name)
        )
      )
    `)
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) {
    console.error('Error fetching recent ratings:', error)
    return []
  }

  return (data || []).map((row: any) => {
    const ride = Array.isArray(row.ride) ? row.ride[0] : row.ride
    const customer = ride?.customer ? (Array.isArray(ride.customer) ? ride.customer[0] : ride.customer) : null
    const driver = ride?.driver ? (Array.isArray(ride.driver) ? ride.driver[0] : ride.driver) : null
    const driverProfile = driver?.profile ? (Array.isArray(driver.profile) ? driver.profile[0] : driver.profile) : null

    return {
      id: row.id,
      rating: row.rating,
      comment: row.comment,
      created_at: row.created_at,
      customer_name: customer?.full_name || 'Unknown',
      driver_name: driverProfile?.full_name || 'Unknown'
    }
  })
}

// ============================================================================
// COMPUTED METRICS
// ============================================================================

/**
 * Calculate all computed metrics from raw data
 */
export function computeMetrics(
  activeTrips: ActiveTrip[],
  activeShuttles: ActiveShuttle[],
  fleet: DriverStatus[],
  todayStats: TodayStats,
  yesterdayStats: YesterdayStats,
  rosterGaps: RosterGap[]
): ComputedMetrics {
  const now = Date.now()

  // Active trips counts
  const awaitingDriver = activeTrips.filter(t => t.status === 'pending').length

  // Calculate averages from today's completed trips
  let totalAccept = 0, countAccept = 0
  let totalArrival = 0, countArrival = 0
  let totalDuration = 0, countDuration = 0
  let totalWait = 0, countWait = 0
  let onTimeCount = 0

  const ON_TIME_THRESHOLD_SECONDS = 600 // 10 minutes for driver arrival

  todayStats.trips_with_times.forEach(t => {
    if (t.created_at && t.accepted_at) {
      const acceptTime = (new Date(t.accepted_at).getTime() - new Date(t.created_at).getTime()) / 1000
      totalAccept += acceptTime
      countAccept++
    }
    if (t.accepted_at && t.arrived_at) {
      const arrivalTime = (new Date(t.arrived_at).getTime() - new Date(t.accepted_at).getTime()) / 1000
      totalArrival += arrivalTime
      countArrival++
      if (arrivalTime <= ON_TIME_THRESHOLD_SECONDS) {
        onTimeCount++
      }
    }
    if (t.started_at && t.completed_at) {
      totalDuration += (new Date(t.completed_at).getTime() - new Date(t.started_at).getTime()) / 1000
      countDuration++
    }
    if (t.created_at && t.arrived_at) {
      totalWait += (new Date(t.arrived_at).getTime() - new Date(t.created_at).getTime()) / 1000
      countWait++
    }
  })

  const avgAcceptSeconds = countAccept > 0 ? totalAccept / countAccept : 0
  const avgArrivalSeconds = countArrival > 0 ? totalArrival / countArrival : 0
  const avgDurationSeconds = countDuration > 0 ? totalDuration / countDuration : 0
  const avgCustomerWaitSeconds = countWait > 0 ? totalWait / countWait : 0
  const onTimeArrivalPercent = countArrival > 0 ? (onTimeCount / countArrival) * 100 : 100

  // Cancellation rate
  const totalTrips = todayStats.total_requests
  const cancellationRate = totalTrips > 0 ? (todayStats.cancelled_trips / totalTrips) * 100 : 0
  const cancellationByCustomer = totalTrips > 0 ? (todayStats.cancelled_by_customer / totalTrips) * 100 : 0
  const cancellationByDriver = totalTrips > 0 ? (todayStats.cancelled_by_driver / totalTrips) * 100 : 0

  // Vehicle utilisation
  const onlineDrivers = fleet.filter(d => d.is_online).length
  const activeDrivers = fleet.filter(d => d.is_online && !d.is_on_break).length
  const vehicleUtilisationPercent = onlineDrivers > 0 ? (activeDrivers / onlineDrivers) * 100 : 0

  // Oldest unassigned request
  let oldestUnassignedSeconds = 0
  let oldestUnassignedId: string | null = null
  const pendingTrips = activeTrips.filter(t => t.status === 'pending')
  if (pendingTrips.length > 0) {
    const oldest = pendingTrips[0] // Already sorted by created_at ascending
    oldestUnassignedSeconds = (now - new Date(oldest.created_at).getTime()) / 1000
    oldestUnassignedId = oldest.id
  }

  // Shuttles near capacity (>= 80%)
  const shuttlesNearCapacity = activeShuttles.filter(s =>
    s.vehicle_capacity > 0 && (s.passengers_on_board / s.vehicle_capacity) >= 0.8
  ).length

  // Deltas vs yesterday
  const completedDelta = todayStats.completed_trips - yesterdayStats.completed_trips
  const avgAcceptDelta = avgAcceptSeconds - yesterdayStats.avg_accept_seconds
  const avgArrivalDelta = avgArrivalSeconds - yesterdayStats.avg_arrival_seconds
  const avgDurationDelta = avgDurationSeconds - yesterdayStats.avg_duration_seconds

  return {
    activeTrips: activeTrips.length,
    awaitingDriver,
    avgAcceptSeconds,
    avgArrivalSeconds,
    avgDurationSeconds,
    avgCustomerWaitSeconds,
    onTimeArrivalPercent,
    cancellationRate,
    cancellationByCustomer,
    cancellationByDriver,
    vehicleUtilisationPercent,
    shuttlesRunning: activeShuttles.length,
    completedToday: todayStats.completed_trips,
    completedDelta,
    avgAcceptDelta,
    avgArrivalDelta,
    avgDurationDelta,
    oldestUnassignedSeconds,
    oldestUnassignedId,
    shuttlesNearCapacity,
    rosterGaps: rosterGaps.length
  }
}

// ============================================================================
// REALTIME SUBSCRIPTIONS (NOT POLLING)
// ============================================================================

export interface ControlRoomSubscriptions {
  rides: RealtimeChannel
  busTracking: RealtimeChannel
  drivers: RealtimeChannel
  busTrips: RealtimeChannel
  driverLocations: RealtimeChannel
  sosAlerts: RealtimeChannel
  ratings: RealtimeChannel
}

/**
 * Set up realtime subscriptions for control room data
 * Returns cleanup function to unsubscribe
 */
export function subscribeToControlRoomUpdates(
  supabase: SupabaseClient,
  onUpdate: () => void
): ControlRoomSubscriptions {
  // Subscribe to rides table for taxi trip updates
  const ridesChannel = supabase
    .channel('control-room-rides')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rides' }, () => {
      console.log('[ControlRoom] Rides update received')
      onUpdate()
    })
    .subscribe()

  // Subscribe to bus_location_tracking for shuttle updates
  const busTrackingChannel = supabase
    .channel('control-room-bus-tracking')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bus_location_tracking' }, () => {
      console.log('[ControlRoom] Bus tracking update received')
      onUpdate()
    })
    .subscribe()

  // Subscribe to drivers table for fleet status
  const driversChannel = supabase
    .channel('control-room-drivers')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, () => {
      console.log('[ControlRoom] Drivers update received')
      onUpdate()
    })
    .subscribe()

  // Subscribe to bus_trips for shuttle trip status
  const busTripsChannel = supabase
    .channel('control-room-bus-trips')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bus_trips' }, () => {
      console.log('[ControlRoom] Bus trips update received')
      onUpdate()
    })
    .subscribe()

  // Subscribe to driver_locations for map updates
  const driverLocationsChannel = supabase
    .channel('control-room-driver-locations')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_locations' }, () => {
      console.log('[ControlRoom] Driver locations update received')
      onUpdate()
    })
    .subscribe()

  // Subscribe to SOS alerts for emergency updates
  const sosAlertsChannel = supabase
    .channel('control-room-sos-alerts')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'sos_alerts' }, () => {
      console.log('[ControlRoom] SOS alert update received')
      onUpdate()
    })
    .subscribe()

  // Subscribe to ratings for live ratings ticker
  const ratingsChannel = supabase
    .channel('control-room-ratings')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ratings' }, () => {
      console.log('[ControlRoom] New rating received')
      onUpdate()
    })
    .subscribe()

  return {
    rides: ridesChannel,
    drivers: driversChannel,
    busTracking: busTrackingChannel,
    busTrips: busTripsChannel,
    driverLocations: driverLocationsChannel,
    sosAlerts: sosAlertsChannel,
    ratings: ratingsChannel
  }
}

/**
 * Unsubscribe from all control room channels
 */
export function unsubscribeFromControlRoom(
  supabase: SupabaseClient,
  subscriptions: ControlRoomSubscriptions
): void {
  supabase.removeChannel(subscriptions.rides)
  supabase.removeChannel(subscriptions.drivers)
  supabase.removeChannel(subscriptions.busTracking)
  supabase.removeChannel(subscriptions.busTrips)
  supabase.removeChannel(subscriptions.driverLocations)
  supabase.removeChannel(subscriptions.sosAlerts)
  supabase.removeChannel(subscriptions.ratings)
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format seconds into human-readable duration
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  const hours = Math.floor(seconds / 3600)
  const mins = Math.round((seconds % 3600) / 60)
  return `${hours}h ${mins}m`
}

/**
 * Format delta with +/- sign and color indicator
 */
export function formatDelta(value: number, lowerIsBetter = false): { text: string; isPositive: boolean } {
  const sign = value >= 0 ? '+' : ''
  const isPositive = lowerIsBetter ? value <= 0 : value >= 0
  return {
    text: `${sign}${Math.round(value)}`,
    isPositive
  }
}

/**
 * Get attention level based on metrics
 */
export function getAttentionLevel(metrics: ComputedMetrics): 'calm' | 'amber' | 'red' {
  const attentionItems = metrics.awaitingDriver + metrics.shuttlesNearCapacity + metrics.rosterGaps

  if (attentionItems === 0) return 'calm'
  if (metrics.oldestUnassignedSeconds > 300 || metrics.shuttlesNearCapacity > 0) return 'red'
  return 'amber'
}
