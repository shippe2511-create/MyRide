"use client"

import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { GoogleMap, useJsApiLoader, OverlayView, Polyline, TrafficLayer, HeatmapLayer, Circle } from "@react-google-maps/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Layers, Car, Satellite, Map as MapIcon, Navigation, Maximize2, Minimize2,
  LocateFixed, Search, X, Volume2, VolumeX, Flame, Target
} from "lucide-react"

const libraries: ("visualization" | "drawing")[] = ["visualization", "drawing"]

interface Driver {
  id: string
  lat: number
  lng: number
  heading?: number
  speed?: number
  name: string
  phone?: string
  avatarUrl?: string
  vehicleNumber?: string
  isOnline: boolean
  isOnBreak?: boolean
  breakType?: string
  activeRide?: {
    id: string
    status: string
    pickup_lat: number
    pickup_lng: number
    dropoff_lat: number
    dropoff_lng: number
    pickup_address?: string
    dropoff_address?: string
    customer_name?: string
    customer_phone?: string
    eta?: number
    distance?: string
  }
}

interface LiveDriverMapProps {
  drivers: Driver[]
  onDriverClick?: (driver: Driver) => void
  showRoutes?: boolean
  selectedDriverId?: string | null
  serviceAreaCenter?: { lat: number; lng: number }
  serviceAreaRadius?: number
}

interface AnimatedPosition {
  lat: number
  lng: number
  heading: number
  targetLat: number
  targetLng: number
  targetHeading: number
}

interface DriverTrail {
  driverId: string
  positions: { lat: number; lng: number; timestamp: number }[]
}

function DriverMarker({
  driver,
  animatedPos,
  onClick,
  isSelected,
  isDark,
  isHovered,
  onHover,
  onLeave,
  isSearchMatch,
}: {
  driver: Driver
  animatedPos: AnimatedPosition
  onClick: () => void
  isSelected: boolean
  isDark: boolean
  isHovered: boolean
  onHover: () => void
  onLeave: () => void
  isSearchMatch: boolean
}) {
  const statusColor = driver.isOnBreak
    ? "#f59e0b"
    : driver.activeRide
      ? "#3b82f6"
      : "#22c55e"

  const statusLabel = driver.isOnBreak
    ? driver.breakType || "Break"
    : driver.activeRide
      ? driver.activeRide.status.replace("_", " ")
      : "Available"

  const hasActiveRide = !!driver.activeRide

  return (
    <OverlayView
      position={{ lat: animatedPos.lat, lng: animatedPos.lng }}
      mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
    >
      <div
        onClick={onClick}
        onMouseEnter={onHover}
        onMouseLeave={onLeave}
        className="cursor-pointer relative"
        style={{
          transform: "translate(-50%, -50%)",
          transition: "all 0.5s ease-out",
        }}
      >
        {/* Search match highlight */}
        {isSearchMatch && (
          <div
            className="absolute rounded-full animate-pulse"
            style={{
              width: 90,
              height: 90,
              left: -23,
              top: -12,
              border: "3px solid #f59e0b",
              backgroundColor: "rgba(245, 158, 11, 0.2)",
            }}
          />
        )}

        {/* Pulse effect for active rides */}
        {hasActiveRide && (
          <div
            className="absolute inset-0 rounded-full animate-ping"
            style={{
              width: 70,
              height: 70,
              left: -13,
              top: -2,
              backgroundColor: "#3b82f6",
              opacity: 0.3,
              animationDuration: "2s",
            }}
          />
        )}

        {/* Selection ring */}
        {isSelected && (
          <div
            className="absolute rounded-full border-2 border-yellow-400"
            style={{
              width: 70,
              height: 70,
              left: -13,
              top: -2,
              boxShadow: "0 0 15px rgba(255, 214, 10, 0.6)",
            }}
          />
        )}

        {/* Vehicle container with rotation */}
        <div
          style={{
            transform: `rotate(${animatedPos.heading || 0}deg)`,
            transition: "transform 0.5s ease-out",
          }}
        >
          {/* Pickup Truck Image */}
          <img
            src="/pickup-truck.png"
            alt="Vehicle"
            width="40"
            height="50"
            style={{
              filter: isSelected
                ? "drop-shadow(0 0 12px #FFD60A)"
                : isDark
                  ? "drop-shadow(0 3px 8px rgba(0,0,0,0.6))"
                  : "drop-shadow(0 2px 6px rgba(0,0,0,0.4))",
            }}
          />
        </div>

        {/* Driver Name & Vehicle Number Badge */}
        <div className="absolute -bottom-10 left-1/2 transform -translate-x-1/2 flex flex-col items-center gap-1">
          <div className="bg-gray-900/95 text-white px-2 py-1 rounded shadow-lg text-[10px] font-medium whitespace-nowrap border border-gray-600">
            {driver.name || "Driver"}
          </div>
          {driver.vehicleNumber && (
            <div className="bg-yellow-400 text-black px-2 py-0.5 rounded shadow-lg text-[10px] font-bold whitespace-nowrap">
              {driver.vehicleNumber}
            </div>
          )}
        </div>

        {/* ETA/Distance badge for active rides */}
        {driver.activeRide?.eta && (
          <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-2 py-0.5 rounded text-[9px] font-medium whitespace-nowrap shadow-md">
            {driver.activeRide.eta} min {driver.activeRide.distance && `• ${driver.activeRide.distance}`}
          </div>
        )}

        {/* Hover tooltip */}
        {isHovered && !isSelected && (
          <div
            className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-10 bg-black/95 text-white p-3 rounded-lg shadow-xl z-50 min-w-[180px]"
            style={{ pointerEvents: "none" }}
          >
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold overflow-hidden"
                style={{ backgroundColor: statusColor }}
              >
                {driver.avatarUrl ? (
                  <img src={driver.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  driver.name?.[0] || "?"
                )}
              </div>
              <div>
                <p className="font-semibold text-sm">{driver.name}</p>
                <p className="text-xs text-gray-400">{driver.phone || "No phone"}</p>
              </div>
            </div>
            <div className="text-xs text-gray-300 space-y-1">
              <p className="flex items-center gap-1">
                <Navigation className="h-3 w-3" />
                {driver.speed?.toFixed(0) || 0} km/h
              </p>
              {driver.activeRide && (
                <p className="text-blue-400">
                  {driver.activeRide.status.replace("_", " ")} ride
                </p>
              )}
            </div>
            <div
              className="absolute left-1/2 -bottom-2 transform -translate-x-1/2"
              style={{
                width: 0,
                height: 0,
                borderLeft: "6px solid transparent",
                borderRight: "6px solid transparent",
                borderTop: "8px solid rgba(0,0,0,0.95)",
              }}
            />
          </div>
        )}
      </div>
    </OverlayView>
  )
}

function LocationPin({
  position,
  label,
  color,
  address,
  showAddress = false
}: {
  position: { lat: number; lng: number }
  label: string
  color: "green" | "red"
  address?: string
  showAddress?: boolean
}) {
  const bgColor = color === "green" ? "#22c55e" : "#ef4444"

  return (
    <OverlayView
      position={position}
      mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
    >
      <div
        className="cursor-pointer"
        style={{ transform: "translate(-50%, -100%)" }}
      >
        <div className="relative">
          {showAddress && address && (
            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 bg-black/90 text-white px-3 py-1.5 rounded-lg text-xs whitespace-nowrap max-w-[220px] truncate shadow-lg">
              {address}
            </div>
          )}
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-lg border-2 border-white"
            style={{ backgroundColor: bgColor }}
          >
            {label}
          </div>
          <div
            className="absolute left-1/2 -bottom-2 w-0 h-0"
            style={{
              transform: "translateX(-50%)",
              borderLeft: "7px solid transparent",
              borderRight: "7px solid transparent",
              borderTop: `10px solid ${bgColor}`,
            }}
          />
        </div>
      </div>
    </OverlayView>
  )
}

function ClusterMarker({ count, position, onClick }: { count: number; position: { lat: number; lng: number }; onClick: () => void }) {
  const size = count > 10 ? 60 : count > 5 ? 50 : 40

  return (
    <OverlayView
      position={position}
      mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
    >
      <div
        onClick={onClick}
        className="cursor-pointer flex items-center justify-center rounded-full bg-primary text-primary-foreground font-bold shadow-lg border-4 border-white"
        style={{
          width: size,
          height: size,
          transform: "translate(-50%, -50%)",
          fontSize: count > 10 ? 16 : 14,
        }}
      >
        {count}
      </div>
    </OverlayView>
  )
}

// Calculate proper geodetic bearing between two points
function calculateBearing(from: { lat: number; lng: number }, to: { lat: number; lng: number }): number {
  const dLon = (to.lng - from.lng) * Math.PI / 180
  const lat1 = from.lat * Math.PI / 180
  const lat2 = to.lat * Math.PI / 180
  const y = Math.sin(dLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

// Calculate distance between two points in meters
function calculateDistance(from: { lat: number; lng: number }, to: { lat: number; lng: number }): number {
  const R = 6371000
  const dLat = (to.lat - from.lat) * Math.PI / 180
  const dLon = (to.lng - from.lng) * Math.PI / 180
  const lat1 = from.lat * Math.PI / 180
  const lat2 = to.lat * Math.PI / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Interpolate angle using shortest path (handles 0/360 boundary)
function lerpAngle(from: number, to: number, t: number): number {
  const diff = ((to - from + 540) % 360) - 180
  return (from + diff * t + 360) % 360
}

const MIN_DISTANCE_FOR_BEARING = 2 // meters

const darkMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#212121" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#212121" }] },
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#2c2c2c" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#373737" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3c3c3c" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#000000" }] },
]

const containerStyle = {
  width: "100%",
  height: "100%",
  minHeight: "400px",
}

const defaultCenter = { lat: 4.1755, lng: 73.5093 }
const defaultServiceAreaRadius = 25000

type MapType = "roadmap" | "satellite" | "terrain" | "hybrid"

export function LiveDriverMap({
  drivers,
  onDriverClick,
  showRoutes = true,
  selectedDriverId = null,
  serviceAreaCenter = defaultCenter,
  serviceAreaRadius = defaultServiceAreaRadius,
}: LiveDriverMapProps) {
  const [map, setMap] = useState<google.maps.Map | null>(null)
  const [isDark, setIsDark] = useState(true)
  const [routePaths, setRoutePaths] = useState<Map<string, { path: google.maps.LatLng[], eta: number, distance: string }>>(new Map())
  const [animatedPositions, setAnimatedPositions] = useState<Map<string, AnimatedPosition>>(new Map())
  const [hoveredDriverId, setHoveredDriverId] = useState<string | null>(null)
  const [showTraffic, setShowTraffic] = useState(false)
  const [mapType, setMapType] = useState<MapType>("roadmap")
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [showSearch, setShowSearch] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(false)
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [showGeofence, setShowGeofence] = useState(false)
  const [enableClustering, setEnableClustering] = useState(false)
  const [driverTrails, setDriverTrails] = useState<Map<string, DriverTrail>>(new Map())
  const [showTrails, setShowTrails] = useState(false)

  const prevPositionsRef = useRef<Map<string, { lat: number; lng: number }>>(new Map())
  const prevDriverStatusRef = useRef<Map<string, string>>(new Map())
  const animationFrameRef = useRef<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const initialFitDoneRef = useRef(false)

  const { isLoaded } = useJsApiLoader({
    id: "google-map-script",
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
    libraries,
  })

  // Initialize audio
  useEffect(() => {
    audioRef.current = new Audio("/notification.mp3")
  }, [])

  // Play sound on status change
  useEffect(() => {
    if (!soundEnabled) return

    drivers.forEach(driver => {
      const prevStatus = prevDriverStatusRef.current.get(driver.id)
      const currentStatus = driver.isOnBreak ? "break" : driver.activeRide ? "busy" : "available"

      if (prevStatus && prevStatus !== currentStatus) {
        audioRef.current?.play().catch(() => {})
      }

      prevDriverStatusRef.current.set(driver.id, currentStatus)
    })
  }, [drivers, soundEnabled])

  // Memoize filtered drivers
  const filteredDrivers = useMemo(() => drivers, [drivers])

  // Search filter
  const searchMatchIds = useMemo(() => {
    if (!searchQuery.trim()) return new Set<string>()
    const query = searchQuery.toLowerCase()
    return new Set(
      filteredDrivers
        .filter(d => d.name.toLowerCase().includes(query) || d.phone?.includes(query))
        .map(d => d.id)
    )
  }, [filteredDrivers, searchQuery])

  // Cluster drivers when zoomed out
  const clusteredDrivers = useMemo(() => {
    if (!enableClustering || !map) return null

    const zoom = map.getZoom() || 13
    if (zoom >= 14) return null

    const clusters: { center: { lat: number; lng: number }; drivers: Driver[] }[] = []
    const clusterRadius = 0.01 * (15 - zoom)

    filteredDrivers.forEach(driver => {
      let addedToCluster = false

      for (const cluster of clusters) {
        const dist = Math.sqrt(
          Math.pow(driver.lat - cluster.center.lat, 2) +
          Math.pow(driver.lng - cluster.center.lng, 2)
        )

        if (dist < clusterRadius) {
          cluster.drivers.push(driver)
          cluster.center.lat = (cluster.center.lat * (cluster.drivers.length - 1) + driver.lat) / cluster.drivers.length
          cluster.center.lng = (cluster.center.lng * (cluster.drivers.length - 1) + driver.lng) / cluster.drivers.length
          addedToCluster = true
          break
        }
      }

      if (!addedToCluster) {
        clusters.push({
          center: { lat: driver.lat, lng: driver.lng },
          drivers: [driver],
        })
      }
    })

    return clusters.filter(c => c.drivers.length > 1)
  }, [filteredDrivers, enableClustering, map])

  // Heatmap data
  const heatmapData = useMemo(() => {
    if (!isLoaded || !showHeatmap) return []
    return filteredDrivers.map(d => new google.maps.LatLng(d.lat, d.lng))
  }, [filteredDrivers, isLoaded, showHeatmap])

  // Create stable key for position changes
  const driversKey = useMemo(() => {
    return filteredDrivers.map(d => `${d.id}:${d.lat.toFixed(6)}:${d.lng.toFixed(6)}:${d.heading}`).join("|")
  }, [filteredDrivers])

  // Update driver trails
  useEffect(() => {
    if (!showTrails) return

    const newTrails = new Map(driverTrails)

    filteredDrivers.forEach(driver => {
      const trail = newTrails.get(driver.id) || { driverId: driver.id, positions: [] }
      const lastPos = trail.positions[trail.positions.length - 1]

      if (!lastPos || lastPos.lat !== driver.lat || lastPos.lng !== driver.lng) {
        trail.positions.push({ lat: driver.lat, lng: driver.lng, timestamp: Date.now() })
        // Keep last 50 positions
        if (trail.positions.length > 50) {
          trail.positions = trail.positions.slice(-50)
        }
        newTrails.set(driver.id, trail)
      }
    })

    setDriverTrails(newTrails)
  }, [driversKey, showTrails])

  // Smooth position and heading interpolation
  useEffect(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }

    const newAnimated = new Map<string, AnimatedPosition>()

    filteredDrivers.forEach(driver => {
      const prev = prevPositionsRef.current.get(driver.id)
      const current = animatedPositions.get(driver.id)

      if (prev && current && (prev.lat !== driver.lat || prev.lng !== driver.lng)) {
        const distance = calculateDistance(prev, { lat: driver.lat, lng: driver.lng })

        // Only update heading if moved enough (prevents spinning when stationary)
        let newTargetHeading = current.targetHeading
        if (distance >= MIN_DISTANCE_FOR_BEARING) {
          newTargetHeading = calculateBearing(prev, { lat: driver.lat, lng: driver.lng })
        }

        // Use calculated heading - driver.heading from DB is often -1 (invalid)
        const validDriverHeading = driver.heading != null && driver.heading >= 0 ? driver.heading : null

        newAnimated.set(driver.id, {
          lat: current.lat,
          lng: current.lng,
          heading: current.heading,
          targetLat: driver.lat,
          targetLng: driver.lng,
          targetHeading: validDriverHeading ?? newTargetHeading,
        })
      } else {
        const validDriverHeading = driver.heading != null && driver.heading >= 0 ? driver.heading : null

        newAnimated.set(driver.id, {
          lat: driver.lat,
          lng: driver.lng,
          heading: current?.heading ?? 0,
          targetLat: driver.lat,
          targetLng: driver.lng,
          targetHeading: validDriverHeading ?? current?.targetHeading ?? 0,
        })
      }

      prevPositionsRef.current.set(driver.id, { lat: driver.lat, lng: driver.lng })
    })

    const animate = () => {
      let needsAnimation = false

      newAnimated.forEach((pos) => {
        const diffLat = pos.targetLat - pos.lat
        const diffLng = pos.targetLng - pos.lng

        // Interpolate position
        if (Math.abs(diffLat) > 0.000001 || Math.abs(diffLng) > 0.000001) {
          pos.lat += diffLat * 0.1
          pos.lng += diffLng * 0.1
          needsAnimation = true
        } else {
          pos.lat = pos.targetLat
          pos.lng = pos.targetLng
        }

        // Interpolate heading smoothly (shortest path)
        const headingDiff = ((pos.targetHeading - pos.heading + 540) % 360) - 180
        if (Math.abs(headingDiff) > 0.5) {
          pos.heading = (pos.heading + headingDiff * 0.15 + 360) % 360
          needsAnimation = true
        } else {
          pos.heading = pos.targetHeading
        }
      })

      setAnimatedPositions(new Map(newAnimated))

      if (needsAnimation) {
        animationFrameRef.current = requestAnimationFrame(animate)
      }
    }

    setAnimatedPositions(newAnimated)
    animationFrameRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [driversKey])

  // Theme detection
  useEffect(() => {
    const checkTheme = () => {
      const dark = document.documentElement.classList.contains("dark")
      setIsDark(dark)
    }

    checkTheme()
    const observer = new MutationObserver(checkTheme)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })

    return () => observer.disconnect()
  }, [])

  // Auto-center on selected driver
  useEffect(() => {
    if (!map || !selectedDriverId) return

    const driver = filteredDrivers.find(d => d.id === selectedDriverId)
    if (driver) {
      map.panTo({ lat: driver.lat, lng: driver.lng })
      const currentZoom = map.getZoom()
      if (currentZoom && currentZoom < 15) {
        map.setZoom(15)
      }
    }
  }, [map, selectedDriverId, filteredDrivers])

  // Fullscreen handling
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange)
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange)
  }, [])

  const toggleFullscreen = () => {
    if (!containerRef.current) return

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }

  // Recenter map to show all drivers
  const recenterMap = () => {
    if (!map || filteredDrivers.length === 0) return

    const bounds = new google.maps.LatLngBounds()
    filteredDrivers.forEach(driver => {
      bounds.extend({ lat: driver.lat, lng: driver.lng })
    })
    map.fitBounds(bounds, { top: 80, right: 80, bottom: 80, left: 80 })

    // Cap zoom at 14 for comfortable view
    setTimeout(() => {
      const zoom = map.getZoom()
      if (zoom && zoom > 14) {
        map.setZoom(14)
      }
    }, 100)
  }

  // Zoom to specific driver
  const zoomToDriver = (driverId: string) => {
    if (!map) return
    const driver = filteredDrivers.find(d => d.id === driverId)
    if (driver) {
      map.panTo({ lat: driver.lat, lng: driver.lng })
      map.setZoom(17)
    }
  }

  // Fetch routes and ETAs
  useEffect(() => {
    if (!isLoaded || !showRoutes) return

    const driversWithRides = filteredDrivers.filter(d => d.activeRide)
    if (driversWithRides.length === 0) {
      setRoutePaths(new Map())
      return
    }

    const directionsService = new google.maps.DirectionsService()
    const newPaths = new Map<string, { path: google.maps.LatLng[], eta: number, distance: string }>()

    driversWithRides.forEach(driver => {
      const ride = driver.activeRide!

      let origin: google.maps.LatLngLiteral
      let destination: google.maps.LatLngLiteral
      let routeKey: string

      if (ride.status === "accepted" || ride.status === "arriving") {
        origin = { lat: driver.lat, lng: driver.lng }
        destination = { lat: ride.pickup_lat, lng: ride.pickup_lng }
        routeKey = `${driver.id}-to-pickup`
      } else if (ride.status === "in_progress") {
        origin = { lat: driver.lat, lng: driver.lng }
        destination = { lat: ride.dropoff_lat, lng: ride.dropoff_lng }
        routeKey = `${driver.id}-to-dropoff`
      } else {
        return
      }

      directionsService.route(
        {
          origin,
          destination,
          travelMode: google.maps.TravelMode.DRIVING,
        },
        (result, status) => {
          if (status === "OK" && result?.routes[0]) {
            const route = result.routes[0]
            const leg = route.legs[0]
            const duration = leg?.duration?.value || 0
            const distanceText = leg?.distance?.text || ""
            const etaMinutes = Math.ceil(duration / 60)

            newPaths.set(routeKey, {
              path: route.overview_path,
              eta: etaMinutes,
              distance: distanceText,
            })
            setRoutePaths(new Map(newPaths))

            if (driver.activeRide) {
              driver.activeRide.eta = etaMinutes
              driver.activeRide.distance = distanceText
            }
          }
        }
      )
    })
  }, [isLoaded, filteredDrivers, showRoutes])

  const onLoad = useCallback((map: google.maps.Map) => {
    setMap(map)
  }, [])

  const onUnmount = useCallback(() => {
    setMap(null)
  }, [])

  // Fit bounds only on initial load
  useEffect(() => {
    if (!map || filteredDrivers.length === 0 || selectedDriverId) return
    if (initialFitDoneRef.current) return

    const validDrivers = filteredDrivers.filter(d => d.lat && d.lng)
    if (validDrivers.length === 0) return

    const bounds = new google.maps.LatLngBounds()
    validDrivers.forEach(driver => {
      bounds.extend({ lat: driver.lat, lng: driver.lng })
      if (driver.activeRide) {
        bounds.extend({ lat: driver.activeRide.pickup_lat, lng: driver.activeRide.pickup_lng })
        bounds.extend({ lat: driver.activeRide.dropoff_lat, lng: driver.activeRide.dropoff_lng })
      }
    })

    map.fitBounds(bounds, { top: 80, right: 80, bottom: 80, left: 80 })

    // Cap zoom at 14 to keep a comfortable view - not too close
    setTimeout(() => {
      const zoom = map.getZoom()
      if (zoom && zoom > 14) {
        map.setZoom(14)
      }
    }, 100)

    initialFitDoneRef.current = true
  }, [map, filteredDrivers, selectedDriverId])

  if (!isLoaded) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-muted" style={{ minHeight: "400px" }}>
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  const driversWithRides = filteredDrivers.filter(d => d.activeRide)
  const driversToShow = clusteredDrivers ?
    filteredDrivers.filter(d => !clusteredDrivers.some(c => c.drivers.includes(d))) :
    filteredDrivers

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={defaultCenter}
        zoom={13}
        onLoad={onLoad}
        onUnmount={onUnmount}
        mapTypeId={mapType}
        options={{
          styles: isDark && mapType === "roadmap" ? darkMapStyle : undefined,
          disableDefaultUI: true,
          zoomControl: false,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        }}
      >
        {/* Traffic Layer */}
        {showTraffic && <TrafficLayer />}

        {/* Heatmap Layer */}
        {showHeatmap && heatmapData.length > 0 && (
          <HeatmapLayer
            data={heatmapData}
            options={{
              radius: 30,
              opacity: 0.6,
            }}
          />
        )}

        {/* Geofence Circle */}
        {showGeofence && (
          <Circle
            center={serviceAreaCenter}
            radius={serviceAreaRadius}
            options={{
              fillColor: isDark ? "#3b82f6" : "#60a5fa",
              fillOpacity: 0.1,
              strokeColor: isDark ? "#3b82f6" : "#2563eb",
              strokeOpacity: 0.8,
              strokeWeight: 2,
            }}
          />
        )}

        {/* Driver Trails */}
        {showTrails && Array.from(driverTrails.values()).map(trail => (
          trail.positions.length > 1 && (
            <Polyline
              key={`trail-${trail.driverId}`}
              path={trail.positions}
              options={{
                strokeColor: "#9333ea",
                strokeOpacity: 0.6,
                strokeWeight: 3,
                icons: [{
                  icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 2,
                    fillColor: "#9333ea",
                    fillOpacity: 1,
                    strokeWeight: 0,
                  },
                  offset: "0",
                  repeat: "20px",
                }],
              }}
            />
          )
        ))}

        {/* Route polylines */}
        {showRoutes && Array.from(routePaths.entries()).map(([key, { path }]) => (
          <Polyline
            key={key}
            path={path}
            options={{
              strokeColor: key.includes("pickup") ? "#22c55e" : "#FFD60A",
              strokeOpacity: 0.9,
              strokeWeight: 5,
              icons: [{
                icon: {
                  path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                  scale: 3,
                  strokeColor: key.includes("pickup") ? "#16a34a" : "#d4a60a",
                  fillColor: key.includes("pickup") ? "#22c55e" : "#FFD60A",
                  fillOpacity: 1,
                },
                offset: "50%",
              }],
            }}
          />
        ))}

        {/* Pickup/Dropoff markers */}
        {showRoutes && driversWithRides.map(driver => (
          driver.activeRide && (
            <div key={`markers-${driver.id}`}>
              <LocationPin
                position={{ lat: driver.activeRide.pickup_lat, lng: driver.activeRide.pickup_lng }}
                label="A"
                color="green"
                address={driver.activeRide.pickup_address}
                showAddress={selectedDriverId === driver.id}
              />
              <LocationPin
                position={{ lat: driver.activeRide.dropoff_lat, lng: driver.activeRide.dropoff_lng }}
                label="B"
                color="red"
                address={driver.activeRide.dropoff_address}
                showAddress={selectedDriverId === driver.id}
              />
            </div>
          )
        ))}

        {/* Cluster markers */}
        {clusteredDrivers?.map((cluster, idx) => (
          <ClusterMarker
            key={`cluster-${idx}`}
            count={cluster.drivers.length}
            position={cluster.center}
            onClick={() => {
              if (map) {
                map.panTo(cluster.center)
                map.setZoom((map.getZoom() || 13) + 2)
              }
            }}
          />
        ))}

        {/* Driver markers */}
        {driversToShow
          .filter(d => d.lat && d.lng)
          .map(driver => {
            const animatedPos = animatedPositions.get(driver.id) || {
              lat: driver.lat,
              lng: driver.lng,
              heading: driver.heading || 0,
              targetLat: driver.lat,
              targetLng: driver.lng,
              targetHeading: driver.heading || 0,
            }

            return (
              <DriverMarker
                key={driver.id}
                driver={driver}
                animatedPos={animatedPos}
                onClick={() => onDriverClick?.(driver)}
                isSelected={selectedDriverId === driver.id}
                isDark={isDark}
                isHovered={hoveredDriverId === driver.id}
                onHover={() => setHoveredDriverId(driver.id)}
                onLeave={() => setHoveredDriverId(null)}
                isSearchMatch={searchMatchIds.has(driver.id)}
              />
            )
          })}
      </GoogleMap>

      {/* Search Bar */}
      {showSearch && (
        <div className="absolute top-3 left-3 right-[180px] flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search driver by name or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-9 bg-background/95 backdrop-blur shadow-lg"
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 transform -translate-y-1/2"
              >
                <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>
          {searchMatchIds.size > 0 && (
            <Button
              size="sm"
              variant="secondary"
              className="shadow-lg"
              onClick={() => {
                const firstMatch = filteredDrivers.find(d => searchMatchIds.has(d.id))
                if (firstMatch) zoomToDriver(firstMatch.id)
              }}
            >
              <Target className="h-4 w-4 mr-1" />
              Go ({searchMatchIds.size})
            </Button>
          )}
        </div>
      )}

      {/* Map Controls */}
      <div className="absolute top-3 right-3 flex flex-col gap-2">
        {/* Search Toggle */}
        <Button
          variant={showSearch ? "default" : "secondary"}
          size="icon"
          className="shadow-lg h-8 w-8"
          onClick={() => setShowSearch(!showSearch)}
          title="Search drivers"
        >
          <Search className="h-4 w-4" />
        </Button>

        {/* Fullscreen Toggle */}
        <Button
          variant="secondary"
          size="icon"
          className="shadow-lg h-8 w-8"
          onClick={toggleFullscreen}
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </Button>

        {/* Recenter */}
        <Button
          variant="secondary"
          size="icon"
          className="shadow-lg h-8 w-8"
          onClick={recenterMap}
          title="Show all drivers"
        >
          <LocateFixed className="h-4 w-4" />
        </Button>

        {/* Sound Toggle */}
        <Button
          variant={soundEnabled ? "default" : "secondary"}
          size="icon"
          className="shadow-lg h-8 w-8"
          onClick={() => setSoundEnabled(!soundEnabled)}
          title={soundEnabled ? "Mute alerts" : "Enable sound alerts"}
        >
          {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        </Button>

        {/* Divider */}
        <div className="h-px bg-border my-1" />

        {/* Traffic Toggle */}
        <Button
          variant={showTraffic ? "default" : "secondary"}
          size="icon"
          className="shadow-lg h-8 w-8"
          onClick={() => setShowTraffic(!showTraffic)}
          title="Traffic layer"
        >
          <Car className="h-4 w-4" />
        </Button>

        {/* Geofence Toggle */}
        <Button
          variant={showGeofence ? "default" : "secondary"}
          size="icon"
          className="shadow-lg h-8 w-8"
          onClick={() => setShowGeofence(!showGeofence)}
          title="Service area"
        >
          <Target className="h-4 w-4" />
        </Button>

        {/* Trails Toggle */}
        <Button
          variant={showTrails ? "default" : "secondary"}
          size="icon"
          className="shadow-lg h-8 w-8"
          onClick={() => setShowTrails(!showTrails)}
          title="Driver trails"
        >
          <Navigation className="h-4 w-4" />
        </Button>

        {/* Divider */}
        <div className="h-px bg-border my-1" />

        {/* Map Type Buttons */}
        <div className="flex flex-col gap-1 bg-background/90 backdrop-blur rounded-lg p-1 shadow-lg">
          <Button
            variant={mapType === "roadmap" ? "default" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onClick={() => setMapType("roadmap")}
            title="Map"
          >
            <MapIcon className="h-4 w-4" />
          </Button>
          <Button
            variant={mapType === "satellite" ? "default" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onClick={() => setMapType("satellite")}
            title="Satellite"
          >
            <Satellite className="h-4 w-4" />
          </Button>
          <Button
            variant={mapType === "terrain" ? "default" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onClick={() => setMapType("terrain")}
            title="Terrain"
          >
            <Layers className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 left-1/2 transform -translate-x-1/2 z-[10] bg-background/90 backdrop-blur rounded-lg px-4 py-2 shadow-lg text-xs">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
            <span>Available</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            <span>On Ride</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span>On Break</span>
          </div>
          {showTrails && (
            <div className="flex items-center gap-1.5 border-l pl-4">
              <div className="w-4 h-0.5 bg-purple-500" />
              <span>Trail</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
