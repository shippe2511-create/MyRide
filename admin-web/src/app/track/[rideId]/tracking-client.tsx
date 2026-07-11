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

export default function TrackingClient({ rideId, initialData }: Props) {
  const [ride] = useState<RideData>(initialData);
  const [driverLat, setDriverLat] = useState<number | null>(initialData.driverLat);
  const [driverLng, setDriverLng] = useState<number | null>(initialData.driverLng);
  const [mapLoaded, setMapLoaded] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const driverMarkerRef = useRef<google.maps.Marker | null>(null);
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);

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

  // Initialize map when loaded
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || !window.google) return;

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

    // Initialize directions renderer for road route
    directionsRendererRef.current = new window.google.maps.DirectionsRenderer({
      map,
      suppressMarkers: true,
      polylineOptions: {
        strokeColor: '#facc15',
        strokeWeight: 6,
        strokeOpacity: 1,
      },
    });

    // Add driver marker if location available
    if (driverLat && driverLng) {
      createDriverMarker(map, driverLat, driverLng);
      calculateRoute(driverLat, driverLng);
    }

    // Fit bounds
    const bounds = new window.google.maps.LatLngBounds();
    bounds.extend({ lat: ride.pickup_lat, lng: ride.pickup_lng });
    bounds.extend({ lat: ride.dropoff_lat, lng: ride.dropoff_lng });
    if (driverLat && driverLng) {
      bounds.extend({ lat: driverLat, lng: driverLng });
    }
    map.fitBounds(bounds, 60);
  }, [mapLoaded, ride, driverLat, driverLng]);

  const createDriverMarker = (map: google.maps.Map, lat: number, lng: number) => {
    if (driverMarkerRef.current) {
      driverMarkerRef.current.setPosition({ lat, lng });
      return;
    }

    driverMarkerRef.current = new window.google.maps.Marker({
      position: { lat, lng },
      map,
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
  };

  const calculateRoute = useCallback((fromLat: number, fromLng: number) => {
    if (!window.google || !directionsRendererRef.current) return;

    const directionsService = new window.google.maps.DirectionsService();

    // Route from driver to destination (dropoff for in_progress, pickup otherwise)
    const destination = ride.status === 'in_progress'
      ? { lat: ride.dropoff_lat, lng: ride.dropoff_lng }
      : { lat: ride.pickup_lat, lng: ride.pickup_lng };

    directionsService.route(
      {
        origin: { lat: fromLat, lng: fromLng },
        destination,
        travelMode: window.google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === 'OK' && result) {
          directionsRendererRef.current?.setDirections(result);
        }
      }
    );
  }, [ride]);

  // Update driver marker
  const updateDriverMarker = useCallback((lat: number, lng: number) => {
    if (!window.google || !mapInstanceRef.current) return;

    if (driverMarkerRef.current) {
      driverMarkerRef.current.setPosition({ lat, lng });
    } else {
      createDriverMarker(mapInstanceRef.current, lat, lng);
    }

    calculateRoute(lat, lng);
  }, [calculateRoute]);

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

      {/* Bottom Sheet */}
      <div className="bg-zinc-900 rounded-t-3xl shrink-0 shadow-2xl">
        {/* Handle */}
        <div className="flex justify-center py-2">
          <div className="w-10 h-1 bg-zinc-700 rounded-full"></div>
        </div>

        {/* Driver Info */}
        <div className="px-4 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-yellow-400 rounded-full flex items-center justify-center text-xl shrink-0">
              🚗
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold truncate">{ride.driverName}</p>
              <p className="text-zinc-400 text-sm truncate">{ride.vehicleInfo || 'Vehicle assigned'}</p>
            </div>
            {ride.driverPhone && (
              <a
                href={`tel:${ride.driverPhone}`}
                className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center shrink-0"
              >
                <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
                </svg>
              </a>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-zinc-800 mx-4"></div>

        {/* Route Info */}
        <div className="p-4">
          <div className="flex gap-3">
            {/* Timeline */}
            <div className="flex flex-col items-center pt-1">
              <div className="w-3 h-3 rounded-full bg-green-500 border-2 border-white"></div>
              <div className="w-0.5 h-8 bg-zinc-700"></div>
              <div className="w-3 h-3 rounded-full bg-red-500 border-2 border-white"></div>
            </div>

            {/* Locations */}
            <div className="flex-1 space-y-4">
              <div>
                <p className="text-zinc-500 text-xs font-medium">PICKUP</p>
                <p className="text-white text-sm">{ride.pickup_name}</p>
              </div>
              <div>
                <p className="text-zinc-500 text-xs font-medium">DROP-OFF</p>
                <p className="text-white text-sm">{ride.dropoff_name}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

declare global {
  interface Window {
    google: typeof google;
    initMap: () => void;
  }
}
