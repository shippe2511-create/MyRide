"use client"

import { useEffect, useState, useCallback } from "react"
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from "@react-google-maps/api"

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

const lightMapStyle: google.maps.MapTypeStyle[] = []

const containerStyle = {
  width: "100%",
  height: "100%",
  minHeight: "400px",
}

const defaultCenter = { lat: 4.1755, lng: 73.5093 }

export function LiveDriverMap({ drivers, onDriverClick }: LiveDriverMapProps) {
  const [map, setMap] = useState<google.maps.Map | null>(null)
  const [isDark, setIsDark] = useState(true)
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null)

  const { isLoaded } = useJsApiLoader({
    id: "google-map-script",
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
  })

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

  const onLoad = useCallback((map: google.maps.Map) => {
    setMap(map)
  }, [])

  const onUnmount = useCallback(() => {
    setMap(null)
  }, [])

  useEffect(() => {
    if (!map || drivers.length === 0) return

    const validDrivers = drivers.filter(d => d.lat && d.lng)
    if (validDrivers.length === 0) return

    const bounds = new google.maps.LatLngBounds()
    validDrivers.forEach(driver => {
      bounds.extend({ lat: driver.lat, lng: driver.lng })
    })

    map.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 })

    const zoom = map.getZoom()
    if (zoom && zoom > 15) {
      map.setZoom(15)
    }
  }, [map, drivers])

  if (!isLoaded) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-muted" style={{ minHeight: "400px" }}>
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={defaultCenter}
      zoom={13}
      onLoad={onLoad}
      onUnmount={onUnmount}
      options={{
        styles: isDark ? darkMapStyle : lightMapStyle,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      }}
    >
      {drivers
        .filter(d => d.lat && d.lng)
        .map(driver => (
          <Marker
            key={driver.id}
            position={{ lat: driver.lat, lng: driver.lng }}
            onClick={() => {
              setSelectedDriver(driver)
              onDriverClick?.(driver.id)
            }}
            icon={{
              url: "data:image/svg+xml," + encodeURIComponent(`
                <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="20" cy="20" r="16" fill="#FFD60A" stroke="#000" stroke-width="3"/>
                  <path d="M28 24h1.5c.4 0 .7-.3.7-.7v-2.1c0-.6-.5-1.2-1.1-1.3-1.2-.4-3.1-.9-3.1-.9s-.9-1-1.5-1.6c-.4-.4-.8-.5-1.3-.5H14.7c-.4 0-.8.3-1 .6l-1 2.1c-.1.3-.2.7-.2 1v2.8c0 .4.3.7.7.7H15" fill="none" stroke="#000" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                  <circle cx="16" cy="24" r="2" fill="none" stroke="#000" stroke-width="1.8"/>
                  <circle cx="26" cy="24" r="2" fill="none" stroke="#000" stroke-width="1.8"/>
                </svg>
              `),
              scaledSize: new google.maps.Size(40, 40),
              anchor: new google.maps.Point(20, 20),
            }}
          />
        ))}

      {selectedDriver && (
        <InfoWindow
          position={{ lat: selectedDriver.lat, lng: selectedDriver.lng }}
          onCloseClick={() => setSelectedDriver(null)}
        >
          <div className="p-2 min-w-[150px]">
            <p className="font-semibold text-gray-900">{selectedDriver.name}</p>
            <p className="text-sm text-gray-500">
              Speed: {selectedDriver.speed?.toFixed(0) || 0} km/h
            </p>
          </div>
        </InfoWindow>
      )}
    </GoogleMap>
  )
}
