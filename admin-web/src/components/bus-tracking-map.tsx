"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { GoogleMap, useJsApiLoader, OverlayView, TrafficLayer } from "@react-google-maps/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Layers, Bus, Satellite, Map as MapIcon, Maximize2, Minimize2,
  LocateFixed, Search, X, Volume2, VolumeX, Target, Users
} from "lucide-react"

const libraries: ("visualization" | "drawing")[] = ["visualization", "drawing"]

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
  { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#263c3f" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#6b9a76" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212a37" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9ca5b3" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#746855" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#1f2835" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#f3d19c" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#2f3948" }] },
  { featureType: "transit.station", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#515c6d" }] },
  { featureType: "water", elementType: "labels.text.stroke", stylers: [{ color: "#17263c" }] },
]

const mapContainerStyle = {
  width: "100%",
  height: "100%",
}

const defaultCenter = {
  lat: 4.1755,
  lng: 73.5093,
}

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
  const vehicleNumber = bus.vehicle?.vehicle_number || "N/A"

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
  const [mapType, setMapType] = useState<"roadmap" | "satellite">("roadmap")
  const [searchQuery, setSearchQuery] = useState("")
  const [showSearch, setShowSearch] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)

  const { isLoaded, loadError } = useJsApiLoader({
    id: "google-map-script",
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
    libraries,
  })

  const onLoad = useCallback((map: google.maps.Map) => {
    setMap(map)
  }, [])

  const onUnmount = useCallback(() => {
    setMap(null)
  }, [])

  // Fit bounds to show all buses
  useEffect(() => {
    if (map && buses.length > 0) {
      const bounds = new google.maps.LatLngBounds()
      buses.forEach((bus) => {
        bounds.extend({ lat: bus.latitude, lng: bus.longitude })
      })
      map.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 })

      const listener = google.maps.event.addListenerOnce(map, "idle", () => {
        const zoom = map.getZoom()
        if (zoom && zoom > 16) {
          map.setZoom(16)
        }
      })
    }
  }, [map, buses.length])

  // Center on selected bus
  useEffect(() => {
    if (map && selectedBusId) {
      const selectedBus = buses.find((b) => b.id === selectedBusId)
      if (selectedBus) {
        map.panTo({ lat: selectedBus.latitude, lng: selectedBus.longitude })
        map.setZoom(15)
      }
    }
  }, [map, selectedBusId, buses])

  const toggleFullscreen = () => {
    if (!containerRef.current) return

    if (!isFullscreen) {
      containerRef.current.requestFullscreen?.()
    } else {
      document.exitFullscreen?.()
    }
    setIsFullscreen(!isFullscreen)
  }

  const centerOnBuses = () => {
    if (map && buses.length > 0) {
      const bounds = new google.maps.LatLngBounds()
      buses.forEach((bus) => {
        bounds.extend({ lat: bus.latitude, lng: bus.longitude })
      })
      map.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 })
    }
  }

  const searchBus = () => {
    if (!searchQuery.trim()) return

    const query = searchQuery.toLowerCase()
    const found = buses.find(
      (b) =>
        b.vehicle?.vehicle_number?.toLowerCase().includes(query) ||
        (b.driver?.profile as any)?.full_name?.toLowerCase().includes(query) ||
        b.route?.route_name?.toLowerCase().includes(query)
    )

    if (found && map) {
      map.panTo({ lat: found.latitude, lng: found.longitude })
      map.setZoom(16)
      onBusClick?.(found)
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
          styles: mapType === "roadmap" ? darkMapStyle : undefined,
          disableDefaultUI: true,
          zoomControl: false,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        }}
      >
        {showTraffic && <TrafficLayer />}

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

      {/* Map Controls - Right Side */}
      <div className="absolute top-4 right-4 flex flex-col gap-2">
        {/* Search */}
        <Button
          size="icon"
          variant="secondary"
          className="w-10 h-10 bg-background/90 backdrop-blur shadow-lg"
          onClick={() => setShowSearch(!showSearch)}
        >
          <Search className="h-5 w-5" />
        </Button>

        {/* Fullscreen */}
        <Button
          size="icon"
          variant="secondary"
          className="w-10 h-10 bg-background/90 backdrop-blur shadow-lg"
          onClick={toggleFullscreen}
        >
          {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
        </Button>

        {/* Center on buses */}
        <Button
          size="icon"
          variant="secondary"
          className="w-10 h-10 bg-background/90 backdrop-blur shadow-lg"
          onClick={centerOnBuses}
        >
          <Target className="h-5 w-5" />
        </Button>

        {/* Sound toggle */}
        <Button
          size="icon"
          variant="secondary"
          className="w-10 h-10 bg-background/90 backdrop-blur shadow-lg"
          onClick={() => setSoundEnabled(!soundEnabled)}
        >
          {soundEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
        </Button>

        <div className="h-px bg-border my-1" />

        {/* Traffic */}
        <Button
          size="icon"
          variant={showTraffic ? "default" : "secondary"}
          className={`w-10 h-10 backdrop-blur shadow-lg ${showTraffic ? "" : "bg-background/90"}`}
          onClick={() => setShowTraffic(!showTraffic)}
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2v20M2 12h20" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </Button>

        {/* Heatmap placeholder */}
        <Button
          size="icon"
          variant="secondary"
          className="w-10 h-10 bg-background/90 backdrop-blur shadow-lg"
        >
          <LocateFixed className="h-5 w-5" />
        </Button>

        {/* Navigation */}
        <Button
          size="icon"
          variant="secondary"
          className="w-10 h-10 bg-background/90 backdrop-blur shadow-lg"
          onClick={centerOnBuses}
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71L12 2z" />
          </svg>
        </Button>

        <div className="h-px bg-border my-1" />

        {/* Map type toggle */}
        <Button
          size="icon"
          variant={mapType === "satellite" ? "default" : "secondary"}
          className={`w-10 h-10 backdrop-blur shadow-lg ${mapType === "satellite" ? "" : "bg-background/90"}`}
          onClick={() => setMapType(mapType === "roadmap" ? "satellite" : "roadmap")}
        >
          <MapIcon className="h-5 w-5" />
        </Button>

        {/* Layers */}
        <Button
          size="icon"
          variant="secondary"
          className="w-10 h-10 bg-background/90 backdrop-blur shadow-lg"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </Button>

        {/* Additional layers */}
        <Button
          size="icon"
          variant="secondary"
          className="w-10 h-10 bg-background/90 backdrop-blur shadow-lg"
        >
          <Layers className="h-5 w-5" />
        </Button>
      </div>

      {/* Search Box */}
      {showSearch && (
        <div className="absolute top-4 left-4 right-20 flex gap-2">
          <div className="relative flex-1 max-w-md">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchBus()}
              placeholder="Search bus, driver, or route..."
              className="bg-background/90 backdrop-blur shadow-lg pr-8"
            />
            {searchQuery && (
              <Button
                size="icon"
                variant="ghost"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                onClick={() => setSearchQuery("")}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          <Button onClick={searchBus} className="shadow-lg">
            Search
          </Button>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-gray-900/90 backdrop-blur rounded-full px-4 py-2 flex items-center gap-4 text-sm text-white shadow-lg">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500"></div>
          <span>Available</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
          <span>Half Full</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-orange-500"></div>
          <span>Almost Full</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500"></div>
          <span>Full</span>
        </div>
      </div>
    </div>
  )
}
