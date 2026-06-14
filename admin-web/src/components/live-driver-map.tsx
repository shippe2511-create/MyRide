"use client"

import { useEffect, useRef, useState } from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"

interface DriverLocation {
  id: string
  driver_id: string
  lat: number
  lng: number
  heading: number
  speed: number
  is_online: boolean
  last_updated: string
  driver?: {
    id: string
    full_name: string
    phone: string | null
    avatar_url: string | null
  }
}

interface Ride {
  id: string
  pickup_name: string
  dropoff_name: string
  pickup_lat: number
  pickup_lng: number
  dropoff_lat: number
  dropoff_lng: number
  status: string
  customer: {
    id: string
    full_name: string
    phone: string | null
  } | null
  driver_id: string | null
}

interface LiveDriverMapProps {
  driverLocations: DriverLocation[]
  activeRides: Ride[]
}

const carIcon = L.divIcon({
  html: `<div style="background: #FFD60A; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 3px solid #000; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.6-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
      <circle cx="7" cy="17" r="2"/>
      <circle cx="17" cy="17" r="2"/>
    </svg>
  </div>`,
  className: "car-marker",
  iconSize: [32, 32],
  iconAnchor: [16, 16],
})

const pickupIcon = L.divIcon({
  html: `<div style="background: #22C55E; width: 16px; height: 16px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
  className: "pickup-marker",
  iconSize: [16, 16],
  iconAnchor: [8, 8],
})

const dropoffIcon = L.divIcon({
  html: `<div style="background: #EF4444; width: 16px; height: 16px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
  className: "dropoff-marker",
  iconSize: [16, 16],
  iconAnchor: [8, 8],
})

export function LiveDriverMap({ driverLocations, activeRides }: LiveDriverMapProps) {
  const mapRef = useRef<L.Map | null>(null)
  const tileLayerRef = useRef<L.TileLayer | null>(null)
  const markersRef = useRef<Map<string, L.Marker>>(new Map())
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDark, setIsDark] = useState(true)

  // Detect theme changes
  useEffect(() => {
    const checkTheme = () => {
      const dark = document.documentElement.classList.contains("dark")
      setIsDark(dark)
    }

    checkTheme()

    // Watch for class changes on documentElement
    const observer = new MutationObserver(checkTheme)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    // Initialize map centered on Maldives
    mapRef.current = L.map(containerRef.current, {
      center: [4.1755, 73.5093],
      zoom: 13,
      zoomControl: true,
    })

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

  // Update tile layer when theme changes
  useEffect(() => {
    if (!mapRef.current) return

    // Remove old tile layer
    if (tileLayerRef.current) {
      tileLayerRef.current.remove()
    }

    // Add new tile layer based on theme
    const tileUrl = isDark
      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"

    tileLayerRef.current = L.tileLayer(tileUrl, {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      subdomains: ["a", "b", "c", "d"],
    }).addTo(mapRef.current)
  }, [isDark])

  useEffect(() => {
    if (!mapRef.current) return

    // Clear old markers
    markersRef.current.forEach((marker) => marker.remove())
    markersRef.current.clear()

    // Add driver markers
    driverLocations.forEach((loc) => {
      if (!loc.lat || !loc.lng) return

      const marker = L.marker([loc.lat, loc.lng], { icon: carIcon })
        .addTo(mapRef.current!)
        .bindPopup(`
          <div style="min-width: 150px;">
            <strong>${loc.driver?.full_name || "Driver"}</strong><br/>
            <span style="color: #888;">Speed: ${loc.speed?.toFixed(0) || 0} km/h</span><br/>
            <span style="color: #888;">Heading: ${loc.heading?.toFixed(0) || 0}°</span>
          </div>
        `)

      markersRef.current.set(`driver-${loc.driver_id}`, marker)
    })

    // Add ride pickup/dropoff markers
    activeRides.forEach((ride) => {
      if (ride.pickup_lat && ride.pickup_lng) {
        const pickupMarker = L.marker([ride.pickup_lat, ride.pickup_lng], { icon: pickupIcon })
          .addTo(mapRef.current!)
          .bindPopup(`<strong>Pickup:</strong> ${ride.pickup_name}`)
        markersRef.current.set(`pickup-${ride.id}`, pickupMarker)
      }

      if (ride.dropoff_lat && ride.dropoff_lng) {
        const dropoffMarker = L.marker([ride.dropoff_lat, ride.dropoff_lng], { icon: dropoffIcon })
          .addTo(mapRef.current!)
          .bindPopup(`<strong>Dropoff:</strong> ${ride.dropoff_name}`)
        markersRef.current.set(`dropoff-${ride.id}`, dropoffMarker)
      }

      // Draw route line from driver to dropoff
      const driverLoc = driverLocations.find(d => d.driver_id === ride.driver_id)
      if (driverLoc && ride.dropoff_lat && ride.dropoff_lng) {
        const polyline = L.polyline(
          [[driverLoc.lat, driverLoc.lng], [ride.dropoff_lat, ride.dropoff_lng]],
          { color: "#FFD60A", weight: 3, opacity: 0.7, dashArray: "10, 10" }
        ).addTo(mapRef.current!)
      }
    })

    // Fit bounds if there are markers
    if (driverLocations.length > 0) {
      const bounds = L.latLngBounds(
        driverLocations.filter(l => l.lat && l.lng).map((loc) => [loc.lat, loc.lng])
      )
      if (bounds.isValid()) {
        mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 })
      }
    }
  }, [driverLocations, activeRides])

  return (
    <div ref={containerRef} className="h-full w-full" style={{ minHeight: "400px" }} />
  )
}
