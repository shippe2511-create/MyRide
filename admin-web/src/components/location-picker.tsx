"use client"

import { useEffect, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search, MapPin, Crosshair, Map as MapIcon, Satellite } from "lucide-react"

interface LocationPickerProps {
  latitude: number | null
  longitude: number | null
  address: string
  onLocationChange: (lat: number, lng: number, address: string) => void
}

export function LocationPicker({ latitude, longitude, address, onLocationChange }: LocationPickerProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [searching, setSearching] = useState(false)
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [mapReady, setMapReady] = useState(false)
  const [mapType, setMapType] = useState<"streets" | "satellite">("streets")

  const defaultCenter = { lat: 4.1755, lng: 73.5093 }

  const tileLayers: Record<string, string> = {
    streets: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  }

  useEffect(() => {
    if (typeof window === "undefined" || !mapContainerRef.current) return
    if (mapRef.current) return

    const initMap = async () => {
      const L = (await import("leaflet")).default
      await import("leaflet/dist/leaflet.css")

      const container = mapContainerRef.current
      if (!container || (container as any)._leaflet_id) return

      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
        iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
      })

      const center = latitude && longitude ? [latitude, longitude] : [defaultCenter.lat, defaultCenter.lng]

      const map = L.map(container, {
        center: center as [number, number],
        zoom: 15,
        zoomControl: false,
      })

      L.tileLayer(tileLayers.streets, { maxZoom: 19 }).addTo(map)

      L.control.zoom({ position: "bottomright" }).addTo(map)

      if (latitude && longitude) {
        const marker = L.marker([latitude, longitude], { draggable: true })
        marker.addTo(map)
        markerRef.current = marker

        marker.on("dragend", () => {
          const pos = marker.getLatLng()
          onLocationChange(pos.lat, pos.lng, address)
        })
      }

      map.on("click", async (e: L.LeafletMouseEvent) => {
        const { lat, lng } = e.latlng
        const L = (await import("leaflet")).default

        if (markerRef.current) {
          markerRef.current.setLatLng([lat, lng])
        } else {
          const marker = L.marker([lat, lng], { draggable: true })
          marker.addTo(map)
          markerRef.current = marker

          marker.on("dragend", () => {
            const pos = marker.getLatLng()
            onLocationChange(pos.lat, pos.lng, address)
          })
        }

        onLocationChange(lat, lng, address)
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

  useEffect(() => {
    if (!mapRef.current || !mapReady) return

    const updateMarker = async () => {
      const L = (await import("leaflet")).default

      if (latitude && longitude) {
        if (markerRef.current) {
          markerRef.current.setLatLng([latitude, longitude])
        } else {
          const marker = L.marker([latitude, longitude], { draggable: true })
          marker.addTo(mapRef.current!)
          markerRef.current = marker

          marker.on("dragend", () => {
            const pos = marker.getLatLng()
            onLocationChange(pos.lat, pos.lng, address)
          })
        }
        mapRef.current?.setView([latitude, longitude], 16)
      }
    }

    updateMarker()
  }, [latitude, longitude, mapReady])

  useEffect(() => {
    if (!mapRef.current || !mapReady) return
    const updateTiles = async () => {
      const L = (await import("leaflet")).default
      mapRef.current!.eachLayer((layer: any) => {
        if (layer._url && (layer._url.includes("tile") || layer._url.includes("arcgis"))) {
          mapRef.current!.removeLayer(layer)
        }
      })
      L.tileLayer(tileLayers[mapType], { maxZoom: 19 }).addTo(mapRef.current!)
    }
    updateTiles()
  }, [mapType, mapReady])

  const searchLocation = async () => {
    if (!searchQuery.trim()) return
    setSearching(true)
    setSuggestions([])

    try {
      // Search globally first, then filter for nearby results
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&viewbox=72.5,8,74,3&bounded=0&limit=8`
      )
      const results = await response.json()
      setSuggestions(results)
    } catch (error) {
      console.error("Search failed:", error)
    }
    setSearching(false)
  }

  const selectSuggestion = (result: any) => {
    const lat = parseFloat(result.lat)
    const lng = parseFloat(result.lon)
    onLocationChange(lat, lng, result.display_name)
    setSearchQuery(result.display_name.split(",")[0])
    setSuggestions([])

    if (mapRef.current) {
      mapRef.current.setView([lat, lng], 16)
    }
  }

  const centerOnMale = () => {
    if (mapRef.current) {
      mapRef.current.setView([defaultCenter.lat, defaultCenter.lng], 14)
    }
  }

  const centerOnMarker = () => {
    if (mapRef.current && markerRef.current) {
      const pos = markerRef.current.getLatLng()
      mapRef.current.setView([pos.lat, pos.lng], 17)
    }
  }

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search location in Maldives..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchLocation()}
              className="pl-9"
            />
          </div>
          <Button type="button" variant="secondary" size="icon" onClick={searchLocation} disabled={searching}>
            {searching ? <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>

        {suggestions.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {suggestions.map((result, i) => (
              <button
                key={i}
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-start gap-2"
                onClick={() => selectSuggestion(result)}
              >
                <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                <span className="line-clamp-2">{result.display_name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Map */}
      <div className="relative">
        <div
          ref={mapContainerRef}
          className="h-[350px] rounded-lg overflow-hidden border"
          style={{ background: "#1a1a2e" }}
        />

        {/* Controls */}
        <div className="absolute top-2 right-2 flex flex-col gap-1">
          <Button
            type="button"
            variant={mapType === "streets" ? "default" : "secondary"}
            size="icon"
            className="h-7 w-7 shadow-lg"
            onClick={() => setMapType("streets")}
            title="Map view"
          >
            <MapIcon className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant={mapType === "satellite" ? "default" : "secondary"}
            size="icon"
            className="h-7 w-7 shadow-lg"
            onClick={() => setMapType("satellite")}
            title="Satellite view"
          >
            <Satellite className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="absolute top-2 left-2 flex gap-1">
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="h-7 w-7 shadow-lg"
            onClick={centerOnMale}
            title="Center on Malé"
          >
            <Crosshair className="h-3.5 w-3.5" />
          </Button>
          {markerRef.current && (
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="h-7 w-7 shadow-lg"
              onClick={centerOnMarker}
              title="Center on marker"
            >
              <MapPin className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        <div className="absolute bottom-2 left-2 bg-background/90 backdrop-blur px-2 py-1 rounded text-xs text-muted-foreground">
          Click map or drag marker
        </div>
      </div>

      {/* Coordinates display */}
      {latitude && longitude && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-green-500/10 border border-green-500/20 text-sm">
          <MapPin className="h-4 w-4 text-green-500" />
          <span className="text-green-500">
            {latitude.toFixed(6)}, {longitude.toFixed(6)}
          </span>
        </div>
      )}
    </div>
  )
}
