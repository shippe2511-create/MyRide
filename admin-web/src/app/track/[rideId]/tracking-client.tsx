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
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const driverMarkerRef = useRef<google.maps.Marker | null>(null);
  const routeLineRef = useRef<google.maps.Polyline | null>(null);

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
      document.head.removeChild(script);
    };
  }, []);

  // Initialize map when loaded
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || !window.google) return;

    const centerLat = (ride.pickup_lat + ride.dropoff_lat) / 2;
    const centerLng = (ride.pickup_lng + ride.dropoff_lng) / 2;

    const map = new window.google.maps.Map(mapRef.current, {
      center: { lat: centerLat, lng: centerLng },
      zoom: 13,
      styles: [
        { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
        { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
        { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
        { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#17263c' }] },
        { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#38414e' }] },
        { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#212a37' }] },
      ],
      disableDefaultUI: true,
      zoomControl: true,
    });

    mapInstanceRef.current = map;

    // Pickup marker (green)
    new window.google.maps.Marker({
      position: { lat: ride.pickup_lat, lng: ride.pickup_lng },
      map,
      title: 'Pickup',
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 12,
        fillColor: '#22c55e',
        fillOpacity: 1,
        strokeColor: '#fff',
        strokeWeight: 3,
      },
    });

    // Dropoff marker (red)
    new window.google.maps.Marker({
      position: { lat: ride.dropoff_lat, lng: ride.dropoff_lng },
      map,
      title: 'Dropoff',
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 12,
        fillColor: '#ef4444',
        fillOpacity: 1,
        strokeColor: '#fff',
        strokeWeight: 3,
      },
    });

    // Fit bounds
    const bounds = new window.google.maps.LatLngBounds();
    bounds.extend({ lat: ride.pickup_lat, lng: ride.pickup_lng });
    bounds.extend({ lat: ride.dropoff_lat, lng: ride.dropoff_lng });

    // Add driver marker if location available
    if (driverLat && driverLng) {
      driverMarkerRef.current = new window.google.maps.Marker({
        position: { lat: driverLat, lng: driverLng },
        map,
        title: 'Driver',
        icon: {
          url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
              <circle cx="24" cy="24" r="20" fill="#facc15" stroke="#fff" stroke-width="4"/>
              <text x="24" y="32" text-anchor="middle" font-size="20">🚗</text>
            </svg>
          `),
          scaledSize: new window.google.maps.Size(48, 48),
          anchor: new window.google.maps.Point(24, 24),
        },
      });

      // Route line
      const targetLat = ride.status === 'in_progress' ? ride.dropoff_lat : ride.pickup_lat;
      const targetLng = ride.status === 'in_progress' ? ride.dropoff_lng : ride.pickup_lng;

      routeLineRef.current = new window.google.maps.Polyline({
        path: [
          { lat: driverLat, lng: driverLng },
          { lat: targetLat, lng: targetLng },
        ],
        geodesic: true,
        strokeColor: '#facc15',
        strokeOpacity: 1.0,
        strokeWeight: 5,
        map,
      });

      bounds.extend({ lat: driverLat, lng: driverLng });
    }

    map.fitBounds(bounds, 60);
  }, [mapLoaded, ride, driverLat, driverLng]);

  // Update driver marker
  const updateDriverMarker = useCallback((lat: number, lng: number) => {
    if (!window.google || !mapInstanceRef.current) return;

    if (driverMarkerRef.current) {
      driverMarkerRef.current.setPosition({ lat, lng });
    } else {
      driverMarkerRef.current = new window.google.maps.Marker({
        position: { lat, lng },
        map: mapInstanceRef.current,
        title: 'Driver',
        icon: {
          url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
              <circle cx="24" cy="24" r="20" fill="#facc15" stroke="#fff" stroke-width="4"/>
              <text x="24" y="32" text-anchor="middle" font-size="20">🚗</text>
            </svg>
          `),
          scaledSize: new window.google.maps.Size(48, 48),
          anchor: new window.google.maps.Point(24, 24),
        },
      });
    }

    // Update route line
    const targetLat = ride.status === 'in_progress' ? ride.dropoff_lat : ride.pickup_lat;
    const targetLng = ride.status === 'in_progress' ? ride.dropoff_lng : ride.pickup_lng;

    if (routeLineRef.current) {
      routeLineRef.current.setPath([
        { lat, lng },
        { lat: targetLat, lng: targetLng },
      ]);
    } else {
      routeLineRef.current = new window.google.maps.Polyline({
        path: [
          { lat, lng },
          { lat: targetLat, lng: targetLng },
        ],
        geodesic: true,
        strokeColor: '#facc15',
        strokeOpacity: 1.0,
        strokeWeight: 5,
        map: mapInstanceRef.current,
      });
    }
  }, [ride]);

  // Poll for driver location
  useEffect(() => {
    if (!ride.driver_id) return;

    const fetchDriverLocation = async () => {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/driver_locations?driver_id=eq.${ride.driver_id}&select=lat,lng`,
          {
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            },
          }
        );
        if (res.ok) {
          const locs = await res.json();
          if (locs && locs.length > 0) {
            const newLat = parseFloat(String(locs[0].lat));
            const newLng = parseFloat(String(locs[0].lng));
            setDriverLat(newLat);
            setDriverLng(newLng);
            updateDriverMarker(newLat, newLng);
          }
        }
      } catch (e) {
        console.error('Failed to fetch driver location', e);
      }
    };

    fetchDriverLocation();
    const interval = setInterval(fetchDriverLocation, 3000);
    return () => clearInterval(interval);
  }, [ride.driver_id, updateDriverMarker]);

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
    <div className="h-screen bg-zinc-900 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-zinc-800 p-3 flex items-center gap-3 shrink-0">
        <div className="w-10 h-10 bg-yellow-400 rounded-full flex items-center justify-center">
          <span className="text-xl">🚕</span>
        </div>
        <div className="flex-1">
          <h1 className="text-white font-bold text-lg">MyRide Live</h1>
          <p className="text-zinc-400 text-xs">#{rideId.slice(0, 8)}</p>
        </div>
        {driverLat && driverLng && (
          <div className="flex items-center gap-1 bg-green-500/20 px-2 py-1 rounded-full">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            <span className="text-green-400 text-xs font-medium">LIVE</span>
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className={`${statusColors[ride.status] || 'bg-gray-500'} text-white text-center py-2 font-semibold shrink-0`}>
        {statusText[ride.status] || ride.status}
      </div>

      {/* Map */}
      <div className="flex-1 relative min-h-0">
        <div ref={mapRef} className="w-full h-full" />
        {!mapLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
            <div className="animate-spin h-8 w-8 border-4 border-yellow-400 border-t-transparent rounded-full"></div>
          </div>
        )}
      </div>

      {/* Bottom Card */}
      <div className="bg-zinc-800 rounded-t-2xl p-4 space-y-3 shrink-0">
        {/* Driver Info */}
        <div className="flex items-center gap-3 bg-zinc-900 rounded-xl p-3">
          <div className="w-12 h-12 bg-yellow-400 rounded-full flex items-center justify-center text-2xl">
            🚗
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold truncate">{ride.driverName}</p>
            <p className="text-zinc-400 text-sm truncate">{ride.vehicleInfo || 'Vehicle assigned'}</p>
          </div>
          {ride.driverPhone && (
            <a
              href={`tel:${ride.driverPhone}`}
              className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center shrink-0"
            >
              <span className="text-white text-lg">📞</span>
            </a>
          )}
        </div>

        {/* Route Info */}
        <div className="bg-zinc-900 rounded-xl p-3">
          <div className="flex items-start gap-3">
            <div className="flex flex-col items-center py-1">
              <div className="w-2.5 h-2.5 bg-green-500 rounded-full"></div>
              <div className="w-0.5 h-8 bg-zinc-600"></div>
              <div className="w-2.5 h-2.5 bg-red-500 rounded-full"></div>
            </div>
            <div className="flex-1 min-w-0 space-y-3">
              <div>
                <p className="text-zinc-500 text-xs">PICKUP</p>
                <p className="text-white text-sm truncate">{ride.pickup_name}</p>
              </div>
              <div>
                <p className="text-zinc-500 text-xs">DROP-OFF</p>
                <p className="text-white text-sm truncate">{ride.dropoff_name}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
