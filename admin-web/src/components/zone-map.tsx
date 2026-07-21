"use client"

import { useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Pencil, Map as MapIcon, Satellite, Layers, Target,
  Maximize2, Minimize2, LocateFixed, Search, X, Edit
} from "lucide-react"

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
  lat: number | null
  lng: number | null
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
  onZoneEdit?: (zone: Zone) => void
  drawingMode: boolean
  setDrawingMode: (mode: boolean) => void
  serviceAreaRadius?: number
  serviceAreaCenter?: { lat: number; lng: number }
  onServiceAreaChange?: (radius: number, center: { lat: number; lng: number }) => void
  rideHeatmapData?: { lat: number; lng: number }[]
}

function ZoneMapInner({
  zones,
  locations,
  selectedZone,
  onZoneSelect,
  onZoneCreate,
  onZoneUpdate,
  onZoneEdit,
  drawingMode,
  setDrawingMode,
  serviceAreaRadius = 5000,
  serviceAreaCenter = { lat: 4.1755, lng: 73.5093 },
  onServiceAreaChange,
  rideHeatmapData = [],
}: ZoneMapProps) {
  const mapRef = useRef<L.Map | null>(null)
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const drawControlRef = useRef<L.Control.Draw | null>(null)
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null)
  const serviceCircleRef = useRef<L.Circle | null>(null)
  const heatmapLayerRef = useRef<any>(null)
  const polygonDrawerRef = useRef<any>(null)
  const [mapReady, setMapReady] = useState(false)
  const [mapType, setMapType] = useState<"streets" | "satellite" | "dark">("dark")
  const [showGeofence, setShowGeofence] = useState(true)
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [editingRadius, setEditingRadius] = useState(false)
  const [tempRadius, setTempRadius] = useState(serviceAreaRadius)
  const [editingBoundary, setEditingBoundary] = useState(false)
  const editablePolygonRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const tileLayers: Record<string, string> = {
    streets: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  }

  useEffect(() => {
    if (typeof window === "undefined" || !mapContainerRef.current) return
    if (mapRef.current) return

    const initMap = async () => {
      const L = (await import("leaflet")).default
      await import("leaflet-draw")
      await import("leaflet/dist/leaflet.css")
      await import("leaflet-draw/dist/leaflet.draw.css")

      const container = mapContainerRef.current
      if (!container || (container as any)._leaflet_id) return

      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
        iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
      })

      const map = L.map(container, {
        center: [serviceAreaCenter.lat, serviceAreaCenter.lng],
        zoom: 13,
        zoomControl: false,
      })

      L.tileLayer(tileLayers[mapType], {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19,
      }).addTo(map)

      const drawnItems = new L.FeatureGroup()
      map.addLayer(drawnItems)
      drawnItemsRef.current = drawnItems

      const drawControl = new L.Control.Draw({
        position: "topright",
        draw: {
          polygon: {
            allowIntersection: false,
            showArea: true,
            shapeOptions: { color: "#FBBF24", weight: 2, fillOpacity: 0.3 },
          },
          polyline: false,
          circle: false,
          circlemarker: false,
          marker: false,
          rectangle: {
            shapeOptions: { color: "#FBBF24", weight: 2, fillOpacity: 0.3 },
          },
        },
        edit: { featureGroup: drawnItems, remove: true },
      })
      drawControlRef.current = drawControl

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.on(L.Draw.Event.CREATED, (e: any) => {
        const layer = e.layer
        drawnItems.addLayer(layer)
        if (e.layerType === "polygon" || e.layerType === "rectangle") {
          const coords = layer.getLatLngs()[0].map((ll: L.LatLng) => [ll.lat, ll.lng])
          onZoneCreate(coords)
        }
        setDrawingMode(false)
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.on(L.Draw.Event.EDITED, (e: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        e.layers.eachLayer((layer: any) => {
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

  // Toggle draw control and auto-start polygon drawing
  useEffect(() => {
    if (!mapRef.current || !mapReady) return

    const startPolygonDraw = async () => {
      const L = (await import("leaflet")).default

      if (drawingMode) {
        // Disable any existing drawer
        if (polygonDrawerRef.current) {
          polygonDrawerRef.current.disable()
        }

        // Create and enable polygon drawer
        const polygonDrawer = new (L as any).Draw.Polygon(mapRef.current, {
          allowIntersection: false,
          showArea: true,
          shapeOptions: { color: "#FBBF24", weight: 2, fillOpacity: 0.3 },
        })
        polygonDrawer.enable()
        polygonDrawerRef.current = polygonDrawer
      } else {
        // Disable drawer when drawing mode is off
        if (polygonDrawerRef.current) {
          polygonDrawerRef.current.disable()
          polygonDrawerRef.current = null
        }
      }
    }

    startPolygonDraw()
  }, [drawingMode, mapReady])

  // Change map type
  useEffect(() => {
    if (!mapRef.current || !mapReady) return
    const updateTiles = async () => {
      const L = (await import("leaflet")).default
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mapRef.current!.eachLayer((layer: any) => {
        if (layer._url && layer._url.includes("tile")) {
          mapRef.current!.removeLayer(layer)
        }
      })
      L.tileLayer(tileLayers[mapType], { maxZoom: 19 }).addTo(mapRef.current!)
    }
    updateTiles()
  }, [mapType, mapReady])

  // Service area circle
  useEffect(() => {
    if (!mapRef.current || !mapReady) return
    const updateCircle = async () => {
      const L = (await import("leaflet")).default
      if (serviceCircleRef.current) {
        mapRef.current!.removeLayer(serviceCircleRef.current)
      }
      if (showGeofence) {
        const circle = L.circle([serviceAreaCenter.lat, serviceAreaCenter.lng], {
          radius: editingRadius ? tempRadius : serviceAreaRadius,
          color: "#2563eb",
          fillColor: "#60a5fa",
          fillOpacity: 0.1,
          weight: 2,
        })
        circle.addTo(mapRef.current!)
        serviceCircleRef.current = circle
      }
    }
    updateCircle()
  }, [showGeofence, serviceAreaRadius, serviceAreaCenter, editingRadius, tempRadius, mapReady])

  // Render zones and locations
  useEffect(() => {
    if (!mapRef.current || !drawnItemsRef.current || !mapReady) return
    const renderZones = async () => {
      const L = (await import("leaflet")).default
      drawnItemsRef.current!.clearLayers()

      zones.forEach((zone) => {
        if (zone.coordinates && zone.coordinates.length > 0) {
          const color = zone.zone_type === "restricted" ? "#EF4444" : zone.zone_type === "pickup" ? "#22C55E" : zone.zone_type === "dropoff" ? "#3B82F6" : "#FBBF24"
          const polygon = L.polygon(zone.coordinates as [number, number][], {
            color,
            weight: selectedZone?.id === zone.id ? 3 : 2,
            fillOpacity: selectedZone?.id === zone.id ? 0.5 : 0.25,
          })
          ;(polygon as any).zoneId = zone.id
          polygon.bindTooltip(zone.name, { permanent: false })
          polygon.on("click", () => onZoneSelect(zone))
          drawnItemsRef.current!.addLayer(polygon)
        }
      })

      locations.forEach((loc) => {
        if (loc.lat && loc.lng) {
          const color = loc.location_type === "pickup" ? "#22C55E" : loc.location_type === "dropoff" ? "#3B82F6" : "#FBBF24"
          const marker = L.circleMarker([loc.lat, loc.lng], {
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

  // Heatmap
  useEffect(() => {
    if (!mapRef.current || !mapReady) return
    const updateHeatmap = async () => {
      if (heatmapLayerRef.current) {
        mapRef.current!.removeLayer(heatmapLayerRef.current)
        heatmapLayerRef.current = null
      }
      if (showHeatmap && rideHeatmapData.length > 0) {
        const L = (await import("leaflet")).default
        const heat = await import("leaflet.heat")
        const points = rideHeatmapData.map(p => [p.lat, p.lng, 0.5] as [number, number, number])
        heatmapLayerRef.current = (L as any).heatLayer(points, { radius: 25, blur: 15, maxZoom: 17 })
        heatmapLayerRef.current.addTo(mapRef.current!)
      }
    }
    updateHeatmap()
  }, [showHeatmap, rideHeatmapData, mapReady])

  const recenterMap = () => {
    if (!mapRef.current) return
    mapRef.current.setView([serviceAreaCenter.lat, serviceAreaCenter.lng], 13)
  }

  const startEditingBoundary = async () => {
    if (!mapRef.current || !selectedZone?.coordinates || selectedZone.coordinates.length === 0) return
    const L = (await import("leaflet")).default

    // Remove existing editable polygon if any
    if (editablePolygonRef.current) {
      mapRef.current.removeLayer(editablePolygonRef.current)
    }

    // Create editable polygon
    const polygon = L.polygon(selectedZone.coordinates as [number, number][], {
      color: "#FBBF24",
      weight: 3,
      fillOpacity: 0.4,
    })

    // Enable editing
    polygon.addTo(mapRef.current)
    if ((polygon as any).editing) {
      (polygon as any).editing.enable()
    }

    editablePolygonRef.current = polygon
    setEditingBoundary(true)
  }

  const saveBoundaryEdit = () => {
    if (!editablePolygonRef.current || !selectedZone) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const latLngs = editablePolygonRef.current.getLatLngs()[0] as any[]
    const coords = latLngs.map((ll: L.LatLng) => [ll.lat, ll.lng])

    onZoneUpdate(selectedZone.id, coords)

    if (mapRef.current && editablePolygonRef.current) {
      mapRef.current.removeLayer(editablePolygonRef.current)
    }
    editablePolygonRef.current = null
    setEditingBoundary(false)
  }

  const cancelBoundaryEdit = () => {
    if (mapRef.current && editablePolygonRef.current) {
      mapRef.current.removeLayer(editablePolygonRef.current)
    }
    editablePolygonRef.current = null
    setEditingBoundary(false)
  }

  const toggleFullscreen = () => {
    if (!containerRef.current) return
    if (!isFullscreen) {
      containerRef.current.requestFullscreen?.()
    } else {
      document.exitFullscreen?.()
    }
    setIsFullscreen(!isFullscreen)
  }

  const searchZone = (query: string) => {
    const zone = zones.find(z => z.name.toLowerCase().includes(query.toLowerCase()))
    if (zone && zone.coordinates && zone.coordinates.length > 0 && mapRef.current) {
      const L = require("leaflet")
      const bounds = L.latLngBounds(zone.coordinates.map((c: number[]) => [c[0], c[1]]))
      mapRef.current.fitBounds(bounds, { padding: [50, 50] })
      onZoneSelect(zone)
    }
  }

  const getZoneColor = (zone: Zone) => {
    if (zone.zone_type === "restricted") return "#EF4444"
    if (zone.zone_type === "pickup") return "#22C55E"
    if (zone.zone_type === "dropoff") return "#3B82F6"
    return "#FBBF24"
  }

  return (
    <div ref={containerRef} className="relative">
      <div ref={mapContainerRef} className="h-[500px] rounded-lg overflow-hidden relative z-0" style={{ background: "#1a1a2e" }} />

      {/* Search */}
      {showSearch && (
        <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search zones..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchZone(searchQuery)}
              className="pl-9 w-48 h-9 shadow-lg"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">
        <Button variant={drawingMode ? "default" : "secondary"} size="icon" className="shadow-lg h-8 w-8" onClick={() => setDrawingMode(!drawingMode)} title="Draw zone">
          {drawingMode ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
        </Button>
        <Button variant={showSearch ? "default" : "secondary"} size="icon" className="shadow-lg h-8 w-8" onClick={() => setShowSearch(!showSearch)} title="Search">
          <Search className="h-4 w-4" />
        </Button>
        <Button variant="secondary" size="icon" className="shadow-lg h-8 w-8" onClick={toggleFullscreen} title="Fullscreen">
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </Button>
        <Button variant="secondary" size="icon" className="shadow-lg h-8 w-8" onClick={recenterMap} title="Recenter">
          <LocateFixed className="h-4 w-4" />
        </Button>

        <div className="h-px bg-border my-1" />

        <div className="flex flex-col gap-1 bg-background/90 backdrop-blur rounded-lg p-1 shadow-lg">
          <Button variant={mapType === "streets" ? "default" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setMapType("streets")} title="Streets">
            <MapIcon className="h-4 w-4" />
          </Button>
          <Button variant={mapType === "satellite" ? "default" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setMapType("satellite")} title="Satellite">
            <Satellite className="h-4 w-4" />
          </Button>
          <Button variant={mapType === "dark" ? "default" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setMapType("dark")} title="Dark">
            <Layers className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Service Area Controls */}
      {showGeofence && (
        <div className="absolute top-3 left-3 z-10 bg-background/95 backdrop-blur p-3 rounded-lg shadow-lg border" style={{ marginTop: showSearch ? '50px' : '0' }}>
          <p className="font-semibold text-sm mb-2 flex items-center gap-2">
            <Target className="h-4 w-4 text-blue-500" />
            Service Area
          </p>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={editingRadius ? tempRadius / 1000 : serviceAreaRadius / 1000}
              onChange={(e) => setTempRadius(parseFloat(e.target.value) * 1000 || 5000)}
              onFocus={() => setEditingRadius(true)}
              className="w-20 h-8 text-sm"
              min={1}
              max={50}
              step={0.5}
            />
            <span className="text-xs text-muted-foreground">km</span>
            {editingRadius && onServiceAreaChange && (
              <>
                <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => { onServiceAreaChange(tempRadius, serviceAreaCenter); setEditingRadius(false) }}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setTempRadius(serviceAreaRadius); setEditingRadius(false) }}>
                  Cancel
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Selected Zone */}
      {selectedZone && (
        <div className="absolute bottom-3 left-3 z-10 bg-background/95 backdrop-blur p-3 rounded-lg shadow-lg border max-w-xs">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getZoneColor(selectedZone) }} />
            <p className="font-semibold text-sm">{selectedZone.name}</p>
          </div>
          <p className="text-xs text-muted-foreground capitalize mb-2">{selectedZone.zone_type} zone</p>
          {editingBoundary ? (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="default" className="h-7 text-xs" onClick={saveBoundaryEdit}>
                Save Boundary
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={cancelBoundaryEdit}>
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              {onZoneEdit && (
                <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => onZoneEdit(selectedZone)}>
                  <Edit className="h-3 w-3 mr-1" />
                  Edit Info
                </Button>
              )}
              {selectedZone.coordinates && selectedZone.coordinates.length > 0 && (
                <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={startEditingBoundary}>
                  <Pencil className="h-3 w-3 mr-1" />
                  Edit Boundary
                </Button>
              )}
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onZoneSelect(null)}>Deselect</Button>
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-3 left-1/2 transform -translate-x-1/2 z-[10] bg-background/90 backdrop-blur rounded-lg px-4 py-2 shadow-lg text-xs">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-green-500" /><span>Pickup</span></div>
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-blue-500" /><span>Dropoff</span></div>
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-red-500" /><span>Restricted</span></div>
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-yellow-500" /><span>Other</span></div>
        </div>
      </div>

      {/* Drawing Mode */}
      {drawingMode && (
        <div className="absolute top-3 left-1/2 transform -translate-x-1/2 z-10 bg-yellow-500 text-black px-4 py-2 rounded-full shadow-lg text-sm font-medium">
          Click map to draw zone polygon
        </div>
      )}
    </div>
  )
}

export const ZoneMap = dynamic(() => Promise.resolve(ZoneMapInner), {
  ssr: false,
  loading: () => (
    <div className="h-[500px] rounded-lg bg-muted flex items-center justify-center">
      <div className="text-center text-muted-foreground">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2" />
        <p className="text-sm">Loading map...</p>
      </div>
    </div>
  ),
})
