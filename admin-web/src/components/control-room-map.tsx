"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { GoogleMap, OverlayView, Circle } from "@react-google-maps/api"
import { useGoogleMaps } from "@/components/providers/google-maps-provider"
import { Car, Bus, MapPin } from "lucide-react"

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
}: ControlRoomMapProps) {
  const { isLoaded, loadError } = useGoogleMaps()
  const mapRef = useRef<google.maps.Map | null>(null)
  const [mapReady, setMapReady] = useState(false)

  const onLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map
    setMapReady(true)
  }, [])

  const onUnmount = useCallback(() => {
    mapRef.current = null
    setMapReady(false)
  }, [])

  // Fit bounds to show all markers
  useEffect(() => {
    if (!mapReady || !mapRef.current || trips.length === 0) return

    const bounds = new google.maps.LatLngBounds()
    trips.forEach(t => bounds.extend({ lat: t.lat, lng: t.lng }))
    pickups.forEach(p => bounds.extend({ lat: p.lat, lng: p.lng }))

    if (!bounds.isEmpty()) {
      mapRef.current.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 })
    }
  }, [mapReady, trips.length])

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
    <GoogleMap
      mapContainerStyle={mapContainerStyle}
      center={defaultCenter}
      zoom={12}
      onLoad={onLoad}
      onUnmount={onUnmount}
      options={{
        styles: darkMapStyle,
        disableDefaultUI: true,
        zoomControl: true,
        zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_CENTER },
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        clickableIcons: false,
        minZoom: 8,
        maxZoom: 18,
      }}
    >
      {/* Service area circle */}
      <Circle
        center={defaultCenter}
        radius={15000}
        options={{
          strokeColor: "#f59e0b",
          strokeOpacity: 0.3,
          strokeWeight: 1,
          fillColor: "#f59e0b",
          fillOpacity: 0.02,
        }}
      />

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
            onClick={() => onMarkerClick?.(trip.id, trip.type)}
          />
        </OverlayView>
      ))}
    </GoogleMap>
  )
}

function TripMarkerComponent({
  trip,
  isSelected,
  onClick,
}: {
  trip: TripMarker
  isSelected: boolean
  onClick: () => void
}) {
  const color = STATUS_COLORS[trip.status] || "#6b7280"
  const isTaxi = trip.type === "taxi"

  return (
    <div
      onClick={onClick}
      className={`
        cursor-pointer transform -translate-x-1/2 -translate-y-1/2
        transition-all duration-200 hover:scale-110
        ${isSelected ? "scale-125 z-50" : "z-10"}
      `}
    >
      <div className="relative">
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
            borderColor: isSelected ? "#fff" : "rgba(255,255,255,0.3)",
          }}
        >
          {isTaxi ? (
            <Car className="h-3 w-3" />
          ) : (
            <Bus className="h-3 w-3" />
          )}
          <span>{trip.label}</span>
        </div>

        {/* Sublabel tooltip on hover/select */}
        {trip.sublabel && isSelected && (
          <div
            className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-2 py-1
                       bg-black/80 text-white text-[9px] rounded whitespace-nowrap"
          >
            {trip.sublabel}
          </div>
        )}

        {/* Alert ring */}
        {trip.isAlert && (
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
