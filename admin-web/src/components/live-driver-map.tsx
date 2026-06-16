"use client"

import { useEffect, useRef, useState } from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"

interface Driver {
  id: string
  lat: number
  lng: number
  heading?: number
  speed?: number
  name: string
  isOnline: boolean
}

interface LiveDriverMapProps {
  drivers: Driver[]
  onDriverClick?: (driverId: string) => void
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

export function LiveDriverMap({ drivers, onDriverClick }: LiveDriverMapProps) {
  const mapRef = useRef<L.Map | null>(null)
  const tileLayerRef = useRef<L.TileLayer | null>(null)
  const markersRef = useRef<Map<string, L.Marker>>(new Map())
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDark, setIsDark] = useState(true)

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

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

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

  useEffect(() => {
    if (!mapRef.current) return

    if (tileLayerRef.current) {
      tileLayerRef.current.remove()
    }

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

    markersRef.current.forEach((marker) => marker.remove())
    markersRef.current.clear()

    const validDrivers = drivers?.filter(d => d.lat && d.lng) || []

    validDrivers.forEach((driver) => {
      const marker = L.marker([driver.lat, driver.lng], { icon: carIcon })
        .addTo(mapRef.current!)
        .bindPopup(`
          <div style="min-width: 150px;">
            <strong>${driver.name}</strong><br/>
            <span style="color: #888;">Speed: ${driver.speed?.toFixed(0) || 0} km/h</span>
          </div>
        `)

      if (onDriverClick) {
        marker.on("click", () => onDriverClick(driver.id))
      }

      markersRef.current.set(`driver-${driver.id}`, marker)
    })

    if (validDrivers.length > 0) {
      const bounds = L.latLngBounds(validDrivers.map((d) => [d.lat, d.lng]))
      if (bounds.isValid()) {
        mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 })
      }
    }
  }, [drivers, onDriverClick])

  return (
    <div ref={containerRef} className="h-full w-full" style={{ minHeight: "400px" }} />
  )
}
