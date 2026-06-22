"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import { Trash2, MapPin, Pencil } from "lucide-react"

interface Zone {
  id: string
  name: string
  zone_type: string
  coordinates?: number[][]
  is_active: boolean
}

interface Location {
  id: string
  name: string
  latitude: number | null
  longitude: number | null
  location_type: string
  is_active: boolean
}

interface ZoneMapProps {
  zones: Zone[]
  locations: Location[]
  selectedZone: Zone | null
  onZoneSelect: (zone: Zone | null) => void
  onZoneCreate: (coordinates: number[][]) => void
  onZoneUpdate: (zoneId: string, coordinates: number[][]) => void
  drawingMode: boolean
  setDrawingMode: (mode: boolean) => void
}

function ZoneMapInner({
  zones,
  locations,
  selectedZone,
  onZoneSelect,
  onZoneCreate,
  onZoneUpdate,
  drawingMode,
  setDrawingMode,
}: ZoneMapProps) {
  const mapRef = useRef<L.Map | null>(null)
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const drawControlRef = useRef<L.Control.Draw | null>(null)
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null)
  const [mapReady, setMapReady] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined" || !mapContainerRef.current) return

    // Prevent double initialization
    if (mapRef.current) return

    const initMap = async () => {
      const L = (await import("leaflet")).default
      await import("leaflet-draw")
      await import("leaflet/dist/leaflet.css")
      await import("leaflet-draw/dist/leaflet.draw.css")

      // Check if container already has a map
      const container = mapContainerRef.current
      if (!container || (container as any)._leaflet_id) return

      // Fix marker icons
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
        iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
      })

      // Maldives centered map
      const map = L.map(container, {
        center: [4.1755, 73.5093],
        zoom: 13,
        zoomControl: true,
      })

      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
        maxZoom: 19,
      }).addTo(map)

      // Feature group for drawn items
      const drawnItems = new L.FeatureGroup()
      map.addLayer(drawnItems)
      drawnItemsRef.current = drawnItems

      // Draw control
      const drawControl = new L.Control.Draw({
        position: "topright",
        draw: {
          polygon: {
            allowIntersection: false,
            showArea: true,
            shapeOptions: {
              color: "#FBBF24",
              weight: 2,
              fillOpacity: 0.3,
            },
          },
          polyline: false,
          circle: false,
          circlemarker: false,
          marker: false,
          rectangle: {
            shapeOptions: {
              color: "#FBBF24",
              weight: 2,
              fillOpacity: 0.3,
            },
          },
        },
        edit: {
          featureGroup: drawnItems,
          remove: true,
        },
      })

      drawControlRef.current = drawControl

      // Handle polygon creation
      map.on(L.Draw.Event.CREATED, (e: any) => {
        const layer = e.layer
        drawnItems.addLayer(layer)

        if (e.layerType === "polygon" || e.layerType === "rectangle") {
          const coords = layer.getLatLngs()[0].map((ll: L.LatLng) => [ll.lat, ll.lng])
          onZoneCreate(coords)
        }
        setDrawingMode(false)
      })

      map.on(L.Draw.Event.EDITED, (e: any) => {
        const layers = e.layers
        layers.eachLayer((layer: any) => {
          if (layer.zoneId) {
            const coords = layer.getLatLngs()[0].map((ll: L.LatLng) => [ll.lat, ll.lng])
            onZoneUpdate(layer.zoneId, coords)
          }
        })
      })

      mapRef.current = map
      setMapReady(true)
    }

    initMap()

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [])

  // Add/remove draw control based on drawing mode
  useEffect(() => {
    if (!mapRef.current || !drawControlRef.current) return

    if (drawingMode) {
      mapRef.current.addControl(drawControlRef.current)
    } else {
      try {
        mapRef.current.removeControl(drawControlRef.current)
      } catch (e) {
        // Control might not be added
      }
    }
  }, [drawingMode, mapReady])

  // Render zones on map
  useEffect(() => {
    if (!mapRef.current || !drawnItemsRef.current || !mapReady) return

    const renderZones = async () => {
      const L = (await import("leaflet")).default
      drawnItemsRef.current!.clearLayers()

      zones.forEach((zone) => {
        if (zone.coordinates && zone.coordinates.length > 0) {
          const color = zone.zone_type === "restricted" ? "#EF4444" : "#22C55E"
          const polygon = L.polygon(zone.coordinates as [number, number][], {
            color,
            weight: 2,
            fillOpacity: selectedZone?.id === zone.id ? 0.5 : 0.25,
          })
          ;(polygon as any).zoneId = zone.id
          polygon.bindTooltip(zone.name, { permanent: false })
          polygon.on("click", () => onZoneSelect(zone))
          drawnItemsRef.current!.addLayer(polygon)
        }
      })

      // Render locations as markers
      locations.forEach((loc) => {
        if (loc.latitude && loc.longitude) {
          const color = loc.location_type === "pickup" ? "#22C55E" : loc.location_type === "dropoff" ? "#3B82F6" : "#FBBF24"
          const marker = L.circleMarker([loc.latitude, loc.longitude], {
            radius: 8,
            color,
            fillColor: color,
            fillOpacity: 0.8,
            weight: 2,
          })
          marker.bindTooltip(loc.name, { permanent: false })
          drawnItemsRef.current!.addLayer(marker)
        }
      })
    }

    renderZones()
  }, [zones, locations, selectedZone, mapReady])

  return (
    <div className="relative">
      <div
        ref={mapContainerRef}
        className="h-[400px] rounded-lg overflow-hidden relative z-0"
        style={{ background: "#1a1a2e" }}
      />
      <div className="absolute top-4 left-4 z-[1000] flex gap-2">
        <Button
          size="sm"
          variant={drawingMode ? "default" : "secondary"}
          onClick={() => setDrawingMode(!drawingMode)}
          className="shadow-lg"
        >
          <Pencil className="h-4 w-4 mr-2" />
          {drawingMode ? "Cancel Drawing" : "Draw Zone"}
        </Button>
      </div>
      {selectedZone && (
        <div className="absolute bottom-4 left-4 z-[1000] bg-card p-3 rounded-lg shadow-lg border">
          <p className="font-medium text-sm">{selectedZone.name}</p>
          <p className="text-xs text-muted-foreground capitalize">{selectedZone.zone_type} zone</p>
          <Button
            size="sm"
            variant="ghost"
            className="mt-2 h-7 text-xs"
            onClick={() => onZoneSelect(null)}
          >
            Deselect
          </Button>
        </div>
      )}
    </div>
  )
}

export const ZoneMap = dynamic(() => Promise.resolve(ZoneMapInner), {
  ssr: false,
  loading: () => (
    <div className="h-[400px] rounded-lg bg-muted flex items-center justify-center">
      <div className="text-center text-muted-foreground">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2" />
        <p className="text-sm">Loading map...</p>
      </div>
    </div>
  ),
})
