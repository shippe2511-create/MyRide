'use client';

import { useEffect, useState, useRef, useCallback } from 'react';

interface RideData {
  id: string;
  status: string;
  pickup_name: string;
  dropoff_name: string;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_lat: number;
  dropoff_lng: number;
  driver_id: string | null;
  driverName: string;
  vehicleInfo: string;
  driverPhone: string;
  driverLat: number | null;
  driverLng: number | null;
}

interface Props {
  rideId: string;
  initialData: RideData;
}

const SUPABASE_URL = 'https://lwkndyyfmmrzazdvrsnk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx3a25keXlmbW1yemF6ZHZyc25rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMTM0NzAsImV4cCI6MjA5NTg4OTQ3MH0.hIcx_gway6VJrTYV1MAXAbcapgTfxo4zYOwgmS2uChg';
const GOOGLE_MAPS_KEY = 'AIzaSyBZ7HVy2dUvTCC5SZkz0MaFCBON2QorFbI';

declare global {
  interface Window {
    google: typeof google;
    initMap: () => void;
  }
}

export default function TrackingClient({ rideId, initialData }: Props) {
  const [ride] = useState<RideData>(initialData);
  const [driverLat, setDriverLat] = useState<number | null>(initialData.driverLat);
  const [driverLng, setDriverLng] = useState<number | null>(initialData.driverLng);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapInitialized, setMapInitialized] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const driverMarkerRef = useRef<google.maps.Marker | null>(null);
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  const lastRouteRef = useRef<string>('');

  // Load Google Maps script
  useEffect(() => {
    if (window.google) {
      setMapLoaded(true);
      return;
    }

    window.initMap = () => setMapLoaded(true);

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&callback=initMap`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);

    return () => {
      if (document.head.contains(script)) {
        document.head.removeChild(script);
      }
    };
  }, []);

  // Initialize map ONCE when loaded
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || !window.google || mapInitialized) return;

    const centerLat = (ride.pickup_lat + ride.dropoff_lat) / 2;
    const centerLng = (ride.pickup_lng + ride.dropoff_lng) / 2;

    const map = new window.google.maps.Map(mapRef.current, {
      center: { lat: centerLat, lng: centerLng },
      zoom: 13,
      styles: [
        { elementType: 'geometry', stylers: [{ color: '#1a1a2e' }] },
        { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1a2e' }] },
        { elementType: 'labels.text.fill', stylers: [{ color: '#8a8a8a' }] },
        { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f0f1a' }] },
        { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2a2a3e' }] },
        { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1a1a2e' }] },
        { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3a3a4e' }] },
        { featureType: 'poi', stylers: [{ visibility: 'off' }] },
        { featureType: 'transit', stylers: [{ visibility: 'off' }] },
      ],
      disableDefaultUI: true,
      zoomControl: true,
      zoomControlOptions: {
        position: window.google.maps.ControlPosition.RIGHT_CENTER,
      },
    });

    mapInstanceRef.current = map;

    // Pickup marker (red pin with B)
    new window.google.maps.Marker({
      position: { lat: ride.pickup_lat, lng: ride.pickup_lng },
      map,
      title: 'Pickup',
      icon: {
        url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" width="36" height="48" viewBox="0 0 36 48">
            <path d="M18 0C8 0 0 8 0 18c0 14 18 30 18 30s18-16 18-30C36 8 28 0 18 0z" fill="#ef4444"/>
            <circle cx="18" cy="16" r="10" fill="#fff"/>
            <text x="18" y="21" text-anchor="middle" font-size="14" font-weight="bold" fill="#ef4444">B</text>
          </svg>
        `),
        scaledSize: new window.google.maps.Size(36, 48),
        anchor: new window.google.maps.Point(18, 48),
      },
    });

    // Dropoff marker (green circle with A)
    new window.google.maps.Marker({
      position: { lat: ride.dropoff_lat, lng: ride.dropoff_lng },
      map,
      title: 'Dropoff',
      icon: {
        url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
            <circle cx="20" cy="20" r="18" fill="#22c55e" stroke="#fff" stroke-width="3"/>
            <text x="20" y="26" text-anchor="middle" font-size="16" font-weight="bold" fill="#fff">A</text>
          </svg>
        `),
        scaledSize: new window.google.maps.Size(40, 40),
        anchor: new window.google.maps.Point(20, 20),
      },
    });

    // Initialize directions renderer
    directionsRendererRef.current = new window.google.maps.DirectionsRenderer({
      map,
      suppressMarkers: true,
      polylineOptions: {
        strokeColor: '#facc15',
        strokeWeight: 6,
        strokeOpacity: 1,
      },
    });

    // Fit bounds
    const bounds = new window.google.maps.LatLngBounds();
    bounds.extend({ lat: ride.pickup_lat, lng: ride.pickup_lng });
    bounds.extend({ lat: ride.dropoff_lat, lng: ride.dropoff_lng });
    if (initialData.driverLat && initialData.driverLng) {
      bounds.extend({ lat: initialData.driverLat, lng: initialData.driverLng });
    }
    map.fitBounds(bounds, 60);

    setMapInitialized(true);
  }, [mapLoaded, mapInitialized, ride, initialData.driverLat, initialData.driverLng]);

  // Create or update driver marker
  const updateDriverOnMap = useCallback((lat: number, lng: number) => {
    if (!window.google || !mapInstanceRef.current) return;

    // Update or create marker
    if (driverMarkerRef.current) {
      driverMarkerRef.current.setPosition({ lat, lng });
    } else {
      driverMarkerRef.current = new window.google.maps.Marker({
        position: { lat, lng },
        map: mapInstanceRef.current,
        title: 'Driver',
        icon: {
          url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 50 50">
              <circle cx="25" cy="25" r="22" fill="#facc15" stroke="#fff" stroke-width="3"/>
              <g transform="translate(12, 12) scale(0.5)">
                <path d="M47.5 25h-5V15c0-1.4-1.1-2.5-2.5-2.5H10c-1.4 0-2.5 1.1-2.5 2.5v10h-5c-1.4 0-2.5 1.1-2.5 2.5v15c0 1.4 1.1 2.5 2.5 2.5h5v2.5c0 1.4 1.1 2.5 2.5 2.5h5c1.4 0 2.5-1.1 2.5-2.5V45h15v2.5c0 1.4 1.1 2.5 2.5 2.5h5c1.4 0 2.5-1.1 2.5-2.5V45h5c1.4 0 2.5-1.1 2.5-2.5v-15c0-1.4-1.1-2.5-2.5-2.5zM12.5 37.5c-2.8 0-5-2.2-5-5s2.2-5 5-5 5 2.2 5 5-2.2 5-5 5zm25 0c-2.8 0-5-2.2-5-5s2.2-5 5-5 5 2.2 5 5-2.2 5-5 5zM40 25H10v-7.5h30V25z" fill="#000"/>
              </g>
            </svg>
          `),
          scaledSize: new window.google.maps.Size(50, 50),
          anchor: new window.google.maps.Point(25, 25),
        },
        zIndex: 1000,
      });
    }

    // Only recalculate route if driver moved significantly (> 50m)
    const routeKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    if (routeKey !== lastRouteRef.current && directionsRendererRef.current) {
      lastRouteRef.current = routeKey;

      const directionsService = new window.google.maps.DirectionsService();
      const destination = ride.status === 'in_progress'
        ? { lat: ride.dropoff_lat, lng: ride.dropoff_lng }
        : { lat: ride.pickup_lat, lng: ride.pickup_lng };

      directionsService.route(
        {
          origin: { lat, lng },
          destination,
          travelMode: window.google.maps.TravelMode.DRIVING,
        },
        (result, status) => {
          if (status === 'OK' && result) {
            directionsRendererRef.current?.setDirections(result);
          }
        }
      );
    }
  }, [ride]);

  // Set initial driver marker after map is ready
  useEffect(() => {
    if (mapInitialized && initialData.driverLat && initialData.driverLng) {
      updateDriverOnMap(initialData.driverLat, initialData.driverLng);
    }
  }, [mapInitialized, initialData.driverLat, initialData.driverLng, updateDriverOnMap]);

  // Poll for driver location updates
  useEffect(() => {
    if (!ride.driver_id || !mapInitialized) return;

    const fetchDriverLocation = async () => {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/driver_locations?driver_id=eq.${ride.driver_id}&select=lat,lng`,
          {
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            },
            cache: 'no-store',
          }
        );
        if (res.ok) {
          const locs = await res.json();
          if (locs && locs.length > 0) {
            const newLat = parseFloat(String(locs[0].lat));
            const newLng = parseFloat(String(locs[0].lng));

            // Only update if position changed
            if (newLat !== driverLat || newLng !== driverLng) {
              setDriverLat(newLat);
              setDriverLng(newLng);
              updateDriverOnMap(newLat, newLng);
            }
          }
        }
      } catch (e) {
        console.error('Failed to fetch driver location', e);
      }
    };

    // Fetch immediately
    fetchDriverLocation();

    // Then poll every 2 seconds
    const interval = setInterval(fetchDriverLocation, 2000);
    return () => clearInterval(interval);
  }, [ride.driver_id, mapInitialized, driverLat, driverLng, updateDriverOnMap]);

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-500',
    accepted: 'bg-blue-500',
    arrived: 'bg-green-500',
    in_progress: 'bg-purple-500',
    completed: 'bg-green-600',
    cancelled: 'bg-red-500',
  };

  const statusText: Record<string, string> = {
    pending: 'Finding driver...',
    accepted: 'Driver on the way',
    arrived: 'Driver arrived',
    in_progress: 'Trip in progress',
    completed: 'Trip completed',
    cancelled: 'Trip cancelled',
  };

  return (
    <div className="h-screen bg-black flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-zinc-900 p-3 flex items-center gap-3 shrink-0">
        <div className="w-12 h-12 bg-yellow-400 rounded-full flex items-center justify-center">
          <span className="text-2xl">🚕</span>
        </div>
        <div className="flex-1">
          <h1 className="text-white font-bold text-lg">MyRide Live</h1>
          <p className="text-zinc-500 text-xs">#{rideId.slice(0, 8)}</p>
        </div>
        {driverLat && driverLng && (
          <div className="flex items-center gap-1.5 bg-green-500/20 border border-green-500/50 px-3 py-1.5 rounded-full">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            <span className="text-green-400 text-sm font-semibold">LIVE</span>
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className={`${statusColors[ride.status] || 'bg-gray-500'} text-white text-center py-2.5 font-bold text-sm shrink-0`}>
        {statusText[ride.status] || ride.status}
      </div>

      {/* Map - Full screen */}
      <div className="flex-1 relative min-h-0">
        <div ref={mapRef} className="w-full h-full" />
        {!mapLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <div className="animate-spin h-10 w-10 border-4 border-yellow-400 border-t-transparent rounded-full"></div>
          </div>
        )}
      </div>

      {/* Bottom Sheet - Compact */}
      <div className="bg-zinc-900 rounded-t-2xl shrink-0" style={{ paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}>
        {/* Handle */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-8 h-1 bg-zinc-700 rounded-full"></div>
        </div>

        {/* Driver + Route in one row */}
        <div className="px-3 pb-3">
          <div className="flex items-center gap-3">
            {/* Driver avatar */}
            <div className="w-11 h-11 bg-yellow-400 rounded-full flex items-center justify-center text-lg shrink-0">
              🚗
            </div>

            {/* Driver info + Route */}
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm truncate">{ride.driverName}</p>
              <div className="flex items-center gap-1 text-xs text-zinc-400 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                <span className="truncate max-w-[80px]">{ride.pickup_name}</span>
                <span className="text-zinc-600 mx-1">→</span>
                <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                <span className="truncate">{ride.dropoff_name}</span>
              </div>
            </div>

            {/* Call button */}
            {ride.driverPhone && (
              <a
                href={`tel:${ride.driverPhone}`}
                className="w-11 h-11 bg-green-500 rounded-full flex items-center justify-center shrink-0"
              >
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
                </svg>
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
