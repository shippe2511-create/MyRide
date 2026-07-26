"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { GoogleMap, OverlayView, Circle, TrafficLayer } from "@react-google-maps/api"
import { useGoogleMaps } from "@/components/providers/google-maps-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Car, Bus, MapPin, Search, X, Maximize2, Minimize2, LocateFixed,
  Volume2, VolumeX, Moon, Sun, Target, Navigation, Layers, Map as MapIcon, Satellite
} from "lucide-react"

interface TripMarker {
  id: string
  type: "taxi" | "shuttle"
  lat: number
  lng: number
  status: string
  label: string
  sublabel?: string
  isAlert?: boolean
}

interface ControlRoomMapProps {
  trips: TripMarker[]
  pickups?: { lat: number; lng: number; tripId: string }[]
  onMarkerClick?: (id: string, type: "taxi" | "shuttle") => void
  selectedId?: string | null
  followingId?: string | null
  onFollowToggle?: (id: string | null) => void
}

const darkMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#1a1a2e" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#6b7280" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a2e" }] },
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#2d2d44" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#3d3d5c" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#4a4a6a" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0f172a" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
]

const mapContainerStyle = {
  width: "100%",
  height: "100%",
}

const defaultCenter = {
  lat: 4.1755,
  lng: 73.5093,
}

const serviceAreaRadius = 15000

const STATUS_COLORS: Record<string, string> = {
  pending: "#f59e0b",
  accepted: "#3b82f6",
  arrived: "#a855f7",
  in_progress: "#22c55e",
  active: "#22c55e",
}

export function ControlRoomMap({
  trips,
  pickups = [],
  onMarkerClick,
  selectedId,
  followingId,
  onFollowToggle,
}: ControlRoomMapProps) {
  const { isLoaded, loadError } = useGoogleMaps()
  const mapRef = useRef<google.maps.Map | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const initialFitDoneRef = useRef(false)

  const [mapReady, setMapReady] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showTraffic, setShowTraffic] = useState(false)
  const [showGeofence, setShowGeofence] = useState(true)
  const [mapType, setMapType] = useState<"roadmap" | "satellite">("roadmap")
  const [searchQuery, setSearchQuery] = useState("")
  const [showSearch, setShowSearch] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [isDark, setIsDark] = useState(true)

  const onLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map
    setMapReady(true)
  }, [])

  const onUnmount = useCallback(() => {
    mapRef.current = null
    setMapReady(false)
  }, [])

  // Fit bounds only on initial load
  useEffect(() => {
    if (!mapReady || !mapRef.current || trips.length === 0) return
    if (initialFitDoneRef.current) return

    const bounds = new google.maps.LatLngBounds()
    trips.forEach(t => bounds.extend({ lat: t.lat, lng: t.lng }))
    pickups.forEach(p => bounds.extend({ lat: p.lat, lng: p.lng }))

    if (!bounds.isEmpty()) {
      mapRef.current.fitBounds(bounds, { top: 50, right: 80, bottom: 50, left: 50 })
    }

    setTimeout(() => {
      const zoom = mapRef.current?.getZoom()
      if (zoom && zoom > 15) {
        mapRef.current?.setZoom(15)
      }
    }, 100)

    initialFitDoneRef.current = true
  }, [mapReady, trips.length])

  // Center on selected marker (one-time)
  useEffect(() => {
    if (mapRef.current && selectedId && !followingId) {
      const selected = trips.find(t => t.id === selectedId)
      if (selected) {
        mapRef.current.panTo({ lat: selected.lat, lng: selected.lng })
        const currentZoom = mapRef.current.getZoom()
        if (currentZoom && currentZoom < 15) {
          mapRef.current.setZoom(15)
        }
      }
    }
  }, [selectedId])

  // Continuously follow when followingId is set
  useEffect(() => {
    if (mapRef.current && followingId) {
      const followed = trips.find(t => t.id === followingId)
      if (followed) {
        mapRef.current.panTo({ lat: followed.lat, lng: followed.lng })
        const currentZoom = mapRef.current.getZoom()
        if (currentZoom && currentZoom < 16) {
          mapRef.current.setZoom(16)
        }
      }
    }
  }, [followingId, trips])

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
    if (!mapRef.current || trips.length === 0) return
    const bounds = new google.maps.LatLngBounds()
    trips.forEach(t => bounds.extend({ lat: t.lat, lng: t.lng }))
    pickups.forEach(p => bounds.extend({ lat: p.lat, lng: p.lng }))
    if (!bounds.isEmpty()) {
      mapRef.current.fitBounds(bounds, { top: 50, right: 80, bottom: 50, left: 50 })
    }
  }

  // Search functionality
  const searchMatchIds = new Set(
    searchQuery.trim()
      ? trips
          .filter(t =>
            t.label?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            t.sublabel?.toLowerCase().includes(searchQuery.toLowerCase())
          )
          .map(t => t.id)
      : []
  )

  const zoomToTrip = (tripId: string) => {
    if (!mapRef.current) return
    const trip = trips.find(t => t.id === tripId)
    if (trip) {
      mapRef.current.panTo({ lat: trip.lat, lng: trip.lng })
      mapRef.current.setZoom(17)
      onMarkerClick?.(trip.id, trip.type)
    }
  }

  if (loadError) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-muted rounded-lg">
        <p className="text-muted-foreground text-sm">Failed to load map</p>
      </div>
    )
  }

  if (!isLoaded) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-muted rounded-lg">
        <div className="animate-pulse text-muted-foreground text-sm">Loading map...</div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={defaultCenter}
        zoom={12}
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
          clickableIcons: false,
          minZoom: 8,
          maxZoom: 18,
        }}
      >
        {showTraffic && <TrafficLayer />}

        {/* Service area circle */}
        {showGeofence && (
          <Circle
            center={defaultCenter}
            radius={serviceAreaRadius}
            options={{
              strokeColor: isDark ? "#3b82f6" : "#2563eb",
              strokeOpacity: 0.5,
              strokeWeight: 2,
              fillColor: isDark ? "#3b82f6" : "#60a5fa",
              fillOpacity: 0.08,
            }}
          />
        )}

        {/* Pickup markers (small dots) */}
        {pickups.map((pickup) => (
          <OverlayView
            key={`pickup-${pickup.tripId}`}
            position={{ lat: pickup.lat, lng: pickup.lng }}
            mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
          >
            <div className="transform -translate-x-1/2 -translate-y-1/2">
              <div className="w-3 h-3 rounded-full bg-green-500 border-2 border-white shadow-lg animate-pulse" />
            </div>
          </OverlayView>
        ))}

        {/* Trip/Driver markers */}
        {trips.map((trip) => (
          <OverlayView
            key={trip.id}
            position={{ lat: trip.lat, lng: trip.lng }}
            mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
          >
            <TripMarkerComponent
              trip={trip}
              isSelected={selectedId === trip.id}
              isFollowing={followingId === trip.id}
              isSearchMatch={searchMatchIds.has(trip.id)}
              onClick={() => onMarkerClick?.(trip.id, trip.type)}
              onFollowClick={(e) => {
                e.stopPropagation()
                onFollowToggle?.(followingId === trip.id ? null : trip.id)
              }}
            />
          </OverlayView>
        ))}
      </GoogleMap>

      {/* Search Bar */}
      {showSearch && (
        <div className="absolute top-3 left-3 right-[60px] flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search driver or vehicle..."
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
                const firstMatch = trips.find(t => searchMatchIds.has(t.id))
                if (firstMatch) zoomToTrip(firstMatch.id)
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
          title="Search"
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
          title="Show all"
        >
          <LocateFixed className="h-4 w-4" />
        </Button>

        {/* Sound Toggle */}
        <Button
          variant={soundEnabled ? "default" : "secondary"}
          size="icon"
          className="shadow-lg h-8 w-8"
          onClick={() => setSoundEnabled(!soundEnabled)}
          title={soundEnabled ? "Mute alerts" : "Enable sound"}
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

        {/* Theme Toggle */}
        <Button
          variant={isDark ? "default" : "secondary"}
          size="icon"
          className="shadow-lg h-8 w-8"
          onClick={() => setIsDark(!isDark)}
          title={isDark ? "Light map" : "Dark map"}
        >
          {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
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
        </div>

        {/* Layers Toggle (toggles all layers) */}
        <Button
          variant="secondary"
          size="icon"
          className="shadow-lg h-8 w-8"
          onClick={() => {
            const newShow = !showTraffic
            setShowTraffic(newShow)
            setShowGeofence(newShow)
          }}
          title="Toggle all layers"
        >
          <Layers className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

function TripMarkerComponent({
  trip,
  isSelected,
  isFollowing,
  isSearchMatch,
  onClick,
  onFollowClick,
}: {
  trip: TripMarker
  isSelected: boolean
  isFollowing: boolean
  isSearchMatch?: boolean
  onClick: () => void
  onFollowClick: (e: React.MouseEvent) => void
}) {
  const color = STATUS_COLORS[trip.status] || "#6b7280"
  const isTaxi = trip.type === "taxi"

  return (
    <div
      onClick={onClick}
      className={`
        cursor-pointer transform -translate-x-1/2 -translate-y-1/2
        transition-all duration-200 hover:scale-110
        ${isSelected || isFollowing ? "scale-125 z-50" : "z-10"}
        ${isSearchMatch ? "ring-2 ring-yellow-400 ring-offset-2 rounded-full" : ""}
      `}
    >
      {/* Following indicator ring */}
      {isFollowing && (
        <div className="absolute -inset-3 rounded-full border-4 border-blue-500 animate-pulse" />
      )}
      <div className="relative">
        {/* Follow button */}
        <button
          onClick={onFollowClick}
          className={`absolute -top-2 -left-2 w-5 h-5 rounded-full flex items-center justify-center text-white border-2 border-white shadow-lg transition-all z-10 ${
            isFollowing ? "bg-blue-500" : "bg-gray-700 hover:bg-blue-600"
          }`}
          title={isFollowing ? "Stop following" : "Follow"}
        >
          <Navigation className="h-2.5 w-2.5" style={{ transform: isFollowing ? "none" : "rotate(-45deg)" }} />
        </button>

        {/* Marker body */}
        <div
          className={`
            flex items-center gap-1 px-2 py-1 rounded-full
            text-white text-[10px] font-medium whitespace-nowrap
            shadow-lg border-2
            ${trip.isAlert ? "animate-pulse" : ""}
          `}
          style={{
            backgroundColor: color,
            borderColor: isSelected || isFollowing ? "#fff" : "rgba(255,255,255,0.3)",
          }}
        >
          {isTaxi ? (
            <Car className="h-3 w-3" />
          ) : (
            <Bus className="h-3 w-3" />
          )}
          <span>{trip.label}</span>
        </div>

        {/* Following badge */}
        {isFollowing && (
          <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 px-1.5 py-0.5 bg-blue-500 text-white text-[8px] rounded font-bold animate-pulse whitespace-nowrap">
            FOLLOWING
          </div>
        )}

        {/* Sublabel tooltip on hover/select */}
        {trip.sublabel && isSelected && !isFollowing && (
          <div
            className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-2 py-1
                       bg-black/80 text-white text-[9px] rounded whitespace-nowrap"
          >
            {trip.sublabel}
          </div>
        )}

        {/* Alert ring */}
        {trip.isAlert && !isFollowing && (
          <div
            className="absolute inset-0 rounded-full animate-ping"
            style={{
              backgroundColor: color,
              opacity: 0.4,
              transform: "scale(1.5)",
            }}
          />
        )}
      </div>
    </div>
  )
}

export default ControlRoomMap
