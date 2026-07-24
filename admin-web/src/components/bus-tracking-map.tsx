"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { GoogleMap, OverlayView, TrafficLayer, HeatmapLayer, Circle } from "@react-google-maps/api"
import { useGoogleMaps } from "@/components/providers/google-maps-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Layers, Bus, Satellite, Map as MapIcon, Maximize2, Minimize2,
  LocateFixed, Search, X, Volume2, VolumeX, Target, Navigation, Car,
  Sun, Moon
} from "lucide-react"

interface BusLocation {
  id: string
  trip_id: string
  driver_id: string
  vehicle_id: string | null
  route_id: string
  latitude: number
  longitude: number
  current_stop_name: string | null
  current_stop_index: number
  passengers_on_board: number
  vehicle_capacity: number
  is_full: boolean
  status: string
  last_updated_at: string
  route?: { route_name: string; route_code: string }
  vehicle?: { vehicle_number: string }
  driver?: { profile?: { full_name: string } }
}

interface BusTrackingMapProps {
  buses: BusLocation[]
  selectedBusId?: string | null
  onBusClick?: (bus: BusLocation) => void
}

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

const mapContainerStyle = {
  width: "100%",
  height: "100%",
}

const defaultCenter = {
  lat: 4.1755,
  lng: 73.5093,
}

const serviceAreaCenter = { lat: 4.1755, lng: 73.5093 }
const serviceAreaRadius = 15000

function BusMarker({
  bus,
  onClick,
  isSelected,
}: {
  bus: BusLocation
  onClick: () => void
  isSelected: boolean
}) {
  const capacityRatio = bus.vehicle_capacity > 0 ? bus.passengers_on_board / bus.vehicle_capacity : 0
  const statusColor = bus.is_full
    ? "#ef4444"
    : capacityRatio >= 0.8
      ? "#f97316"
      : capacityRatio >= 0.5
        ? "#eab308"
        : "#22c55e"

  const driverName = (bus.driver?.profile as any)?.full_name || "Unknown"
  const vehicleNumber = bus.vehicle_number || bus.vehicle?.vehicle_number || "N/A"

  return (
    <div
      onClick={onClick}
      className="cursor-pointer transform -translate-x-1/2 -translate-y-1/2 transition-transform hover:scale-110"
      style={{ zIndex: isSelected ? 1000 : 1 }}
    >
      {/* Bus icon */}
      <div className="relative">
        <svg
          width="48"
          height="48"
          viewBox="0 0 48 48"
          fill="none"
          style={{
            filter: isSelected ? "drop-shadow(0 0 8px rgba(255,255,255,0.5))" : "drop-shadow(0 2px 4px rgba(0,0,0,0.3))",
          }}
        >
          <rect x="12" y="16" width="24" height="20" rx="4" fill={statusColor} />
          <rect x="14" y="18" width="8" height="6" rx="1" fill="white" fillOpacity="0.9" />
          <rect x="26" y="18" width="8" height="6" rx="1" fill="white" fillOpacity="0.9" />
          <circle cx="18" cy="36" r="3" fill="#1f2937" />
          <circle cx="30" cy="36" r="3" fill="#1f2937" />
          <rect x="14" y="12" width="20" height="6" rx="2" fill={statusColor} />
          <rect x="18" y="13" width="12" height="4" rx="1" fill="white" fillOpacity="0.7" />
        </svg>

        <div
          className="absolute -top-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 border-white"
          style={{ backgroundColor: statusColor }}
        >
          {bus.passengers_on_board}
        </div>
      </div>

      <div className="mt-1 flex flex-col items-center">
        <div className="bg-gray-900/90 text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap">
          {driverName}
        </div>
        <div
          className="text-xs px-2 py-0.5 rounded mt-0.5 font-semibold"
          style={{ backgroundColor: statusColor, color: "white" }}
        >
          {vehicleNumber}
        </div>
      </div>
    </div>
  )
}

export function BusTrackingMap({ buses, selectedBusId, onBusClick }: BusTrackingMapProps) {
  const [map, setMap] = useState<google.maps.Map | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showTraffic, setShowTraffic] = useState(false)
  const [showGeofence, setShowGeofence] = useState(false)
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [mapType, setMapType] = useState<"roadmap" | "satellite" | "terrain">("roadmap")
  const [searchQuery, setSearchQuery] = useState("")
  const [showSearch, setShowSearch] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [isDark, setIsDark] = useState(true)
  const [manualTheme, setManualTheme] = useState<"auto" | "dark" | "light">("dark")
  const containerRef = useRef<HTMLDivElement>(null)
  const initialFitDoneRef = useRef(false)

  const { isLoaded, loadError } = useGoogleMaps()

  // Theme detection - manual override takes precedence
  useEffect(() => {
    if (manualTheme === "auto") {
      const checkTheme = () => {
        const dark = document.documentElement.classList.contains("dark")
        setIsDark(dark)
      }
      checkTheme()
      const observer = new MutationObserver(checkTheme)
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
      return () => observer.disconnect()
    } else {
      setIsDark(manualTheme === "dark")
    }
  }, [manualTheme])

  // Heatmap data from bus locations
  const heatmapData = buses.map(bus =>
    isLoaded && window.google ? new google.maps.LatLng(bus.latitude, bus.longitude) : null
  ).filter(Boolean) as google.maps.LatLng[]

  const onLoad = useCallback((map: google.maps.Map) => {
    setMap(map)
  }, [])

  const onUnmount = useCallback(() => {
    setMap(null)
  }, [])

  // Fit bounds only on initial load
  useEffect(() => {
    if (!map || buses.length === 0 || selectedBusId) return
    if (initialFitDoneRef.current) return

    const validBuses = buses.filter(b => b.latitude && b.longitude)
    if (validBuses.length === 0) return

    const bounds = new google.maps.LatLngBounds()
    validBuses.forEach((bus) => {
      bounds.extend({ lat: bus.latitude, lng: bus.longitude })
    })
    map.fitBounds(bounds, { top: 80, right: 80, bottom: 80, left: 80 })

    setTimeout(() => {
      const zoom = map.getZoom()
      if (zoom && zoom > 14) {
        map.setZoom(14)
      }
    }, 100)

    initialFitDoneRef.current = true
  }, [map, buses, selectedBusId])

  // Center on selected bus
  useEffect(() => {
    if (map && selectedBusId) {
      const selectedBus = buses.find((b) => b.id === selectedBusId)
      if (selectedBus) {
        map.panTo({ lat: selectedBus.latitude, lng: selectedBus.longitude })
        const currentZoom = map.getZoom()
        if (currentZoom && currentZoom < 15) {
          map.setZoom(15)
        }
      }
    }
  }, [map, selectedBusId, buses])

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

  const recenterMap = () => {
    if (!map || buses.length === 0) return

    const bounds = new google.maps.LatLngBounds()
    buses.forEach((bus) => {
      bounds.extend({ lat: bus.latitude, lng: bus.longitude })
    })
    map.fitBounds(bounds, { top: 80, right: 80, bottom: 80, left: 80 })

    setTimeout(() => {
      const zoom = map.getZoom()
      if (zoom && zoom > 14) {
        map.setZoom(14)
      }
    }, 100)
  }

  const searchMatchIds = new Set(
    searchQuery.trim()
      ? buses
          .filter(b =>
            b.vehicle?.vehicle_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (b.driver?.profile as any)?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            b.route?.route_name?.toLowerCase().includes(searchQuery.toLowerCase())
          )
          .map(b => b.id)
      : []
  )

  const zoomToBus = (busId: string) => {
    if (!map) return
    const bus = buses.find(b => b.id === busId)
    if (bus) {
      map.panTo({ lat: bus.latitude, lng: bus.longitude })
      map.setZoom(17)
      onBusClick?.(bus)
    }
  }

  if (loadError) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-muted">
        <p className="text-muted-foreground">Error loading map</p>
      </div>
    )
  }

  if (!isLoaded) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-muted">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
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
        {showTraffic && <TrafficLayer />}

        {showHeatmap && heatmapData.length > 0 && (
          <HeatmapLayer
            data={heatmapData}
            options={{
              radius: 30,
              opacity: 0.6,
            }}
          />
        )}

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

        {buses.map((bus) => (
          <OverlayView
            key={bus.id}
            position={{ lat: bus.latitude, lng: bus.longitude }}
            mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
          >
            <BusMarker
              bus={bus}
              onClick={() => onBusClick?.(bus)}
              isSelected={selectedBusId === bus.id}
            />
          </OverlayView>
        ))}
      </GoogleMap>

      {/* Search Bar */}
      {showSearch && (
        <div className="absolute top-3 left-3 right-[180px] flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search bus, driver, or route..."
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
                const firstMatch = buses.find(b => searchMatchIds.has(b.id))
                if (firstMatch) zoomToBus(firstMatch.id)
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
          title="Search buses"
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
          title="Show all buses"
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

        {/* Theme Toggle */}
        <Button
          variant={isDark ? "default" : "secondary"}
          size="icon"
          className="shadow-lg h-8 w-8"
          onClick={() => setManualTheme(isDark ? "light" : "dark")}
          title={isDark ? "Light map" : "Dark map"}
        >
          {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
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

        {/* Heatmap Toggle */}
        <Button
          variant={showHeatmap ? "default" : "secondary"}
          size="icon"
          className="shadow-lg h-8 w-8"
          onClick={() => setShowHeatmap(!showHeatmap)}
          title="Bus heatmap"
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
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
            <span>Half Full</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />
            <span>Almost Full</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <span>Full</span>
          </div>
        </div>
      </div>
    </div>
  )
}
