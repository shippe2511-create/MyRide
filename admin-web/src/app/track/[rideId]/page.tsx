'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { GoogleMap, useJsApiLoader, Marker, Polyline } from '@react-google-maps/api';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface RideData {
  id: string;
  status: string;
  pickup_name: string;
  dropoff_name: string;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_lat: number;
  dropoff_lng: number;
  driver_id: string;
  driver?: {
    full_name: string;
    phone: string;
    vehicle_number: string;
    vehicle_model: string;
  };
}

interface DriverLocation {
  lat: number;
  lng: number;
  heading?: number;
}

const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#212121' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#212121' }] },
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#2c2c2c' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#373737' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3c3c3c' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#000000' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

export default function TrackingPage() {
  const params = useParams();
  const rideId = params.rideId as string;

  const [ride, setRide] = useState<RideData | null>(null);
  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [routePath, setRoutePath] = useState<{ lat: number; lng: number }[]>([]);
  const [eta, setEta] = useState<string>('--');
  const mapRef = useRef<google.maps.Map | null>(null);

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
  });

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  // Fetch ride data
  useEffect(() => {
    async function fetchRide() {
      try {
        const { data: rideData, error: rideError } = await supabase
          .from('rides')
          .select('*')
          .eq('id', rideId)
          .single();

        if (rideError) throw rideError;
        if (!rideData) throw new Error('Ride not found');

        let driverProfile = null;
        if (rideData.driver_id) {
          const { data: driverData } = await supabase
            .from('profiles')
            .select('full_name, phone, vehicle_number, vehicle_model')
            .eq('id', rideData.driver_id)
            .single();
          driverProfile = driverData;

          const { data: locData, error: locError } = await supabase
            .from('driver_locations')
            .select('lat, lng, heading')
            .eq('driver_id', rideData.driver_id)
            .single();

          console.log('Driver ID:', rideData.driver_id);
          console.log('Location query result:', locData, 'Error:', locError);

          if (locData?.lat && locData?.lng) {
            const driverLoc = {
              lat: parseFloat(String(locData.lat)),
              lng: parseFloat(String(locData.lng)),
              heading: parseFloat(String(locData.heading || 0)),
            };
            console.log('Driver location SET:', driverLoc);
            setDriverLocation(driverLoc);
          } else {
            console.log('No valid driver location found');
          }
        }

        setRide({
          ...rideData,
          pickup_lat: parseFloat(String(rideData.pickup_lat)) || 4.1755,
          pickup_lng: parseFloat(String(rideData.pickup_lng)) || 73.5093,
          dropoff_lat: parseFloat(String(rideData.dropoff_lat)) || 4.1755,
          dropoff_lng: parseFloat(String(rideData.dropoff_lng)) || 73.5093,
          driver: driverProfile,
        });
        setLoading(false);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load ride');
        setLoading(false);
      }
    }

    if (rideId) fetchRide();
  }, [rideId]);

  // Subscribe to driver location updates
  useEffect(() => {
    if (!ride?.driver_id) return;

    const channel = supabase
      .channel(`track_driver_${ride.driver_id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'driver_locations', filter: `driver_id=eq.${ride.driver_id}` },
        (payload) => {
          const loc = payload.new as { lat: string; lng: string; heading?: number };
          if (loc?.lat && loc?.lng) {
            setDriverLocation({
              lat: parseFloat(String(loc.lat)),
              lng: parseFloat(String(loc.lng)),
              heading: loc.heading,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ride?.driver_id]);

  // Subscribe to ride status updates
  useEffect(() => {
    if (!rideId) return;

    const channel = supabase
      .channel(`track_ride_${rideId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rides', filter: `id=eq.${rideId}` },
        (payload) => {
          setRide((prev) => prev ? { ...prev, status: payload.new.status } : null);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [rideId]);

  // Set simple route path (straight line as fallback)
  useEffect(() => {
    if (!ride || !driverLocation) return;

    const destination = ride.status === 'in_progress'
      ? { lat: ride.dropoff_lat, lng: ride.dropoff_lng }
      : { lat: ride.pickup_lat, lng: ride.pickup_lng };

    // Simple straight line route
    setRoutePath([
      { lat: driverLocation.lat, lng: driverLocation.lng },
      destination
    ]);
    console.log('Route set from driver to destination');
  }, [ride, driverLocation]);

  // Fetch ETA using Directions API
  useEffect(() => {
    if (!ride || !driverLocation || !isLoaded || typeof google === 'undefined') return;

    const destination = ride.status === 'in_progress'
      ? { lat: ride.dropoff_lat, lng: ride.dropoff_lng }
      : { lat: ride.pickup_lat, lng: ride.pickup_lng };

    try {
      const directionsService = new google.maps.DirectionsService();
      directionsService.route(
        {
          origin: { lat: driverLocation.lat, lng: driverLocation.lng },
          destination,
          travelMode: google.maps.TravelMode.DRIVING,
        },
        (result, status) => {
          if (status === 'OK' && result) {
            const route = result.routes[0];
            if (route?.legs[0]) {
              setEta(route.legs[0].duration?.text || '--');
            }
            // Use actual route path instead of straight line
            const path = route.overview_path.map((p) => ({ lat: p.lat(), lng: p.lng() }));
            setRoutePath(path);
          }
        }
      );
    } catch (e) {
      console.error('Directions API error:', e);
    }
  }, [ride, driverLocation, isLoaded]);

  // Fit map bounds
  useEffect(() => {
    if (!mapRef.current || !ride || !isLoaded || typeof google === 'undefined') return;

    const bounds = new google.maps.LatLngBounds();
    bounds.extend({ lat: ride.pickup_lat, lng: ride.pickup_lng });
    bounds.extend({ lat: ride.dropoff_lat, lng: ride.dropoff_lng });
    if (driverLocation) {
      bounds.extend({ lat: driverLocation.lat, lng: driverLocation.lng });
    }
    mapRef.current.fitBounds(bounds, { top: 100, bottom: 280, left: 20, right: 20 });
  }, [ride, driverLocation, isLoaded]);

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'pending': return { text: 'Finding driver...', color: 'bg-yellow-500', icon: '🔍' };
      case 'accepted': return { text: 'Driver on the way', color: 'bg-blue-500', icon: '🚗' };
      case 'arrived': return { text: 'Driver arrived', color: 'bg-green-500', icon: '📍' };
      case 'in_progress': return { text: 'Trip in progress', color: 'bg-purple-500', icon: '🛣️' };
      case 'completed': return { text: 'Trip completed', color: 'bg-green-600', icon: '✅' };
      case 'cancelled': return { text: 'Trip cancelled', color: 'bg-red-500', icon: '❌' };
      default: return { text: status, color: 'bg-gray-500', icon: '📌' };
    }
  };

  if (loading) {
    return (
      <div className="h-screen bg-zinc-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-yellow-400 mx-auto mb-4"></div>
          <p className="text-zinc-400">Loading tracking...</p>
        </div>
      </div>
    );
  }

  if (error || !ride) {
    return (
      <div className="h-screen bg-zinc-900 flex items-center justify-center p-4">
        <div className="bg-zinc-800 rounded-2xl p-6 text-center max-w-md">
          <div className="text-4xl mb-4">😔</div>
          <div className="text-red-400 text-xl mb-2">Ride Not Found</div>
          <p className="text-zinc-400">{error || 'This tracking link is invalid or has expired.'}</p>
        </div>
      </div>
    );
  }

  const statusInfo = getStatusInfo(ride.status);

  return (
    <div className="h-screen w-screen overflow-hidden bg-zinc-900 relative">
      {/* Full Screen Map */}
      {isLoaded ? (
        <GoogleMap
          mapContainerStyle={{ width: '100%', height: '100%' }}
          center={driverLocation || { lat: ride.pickup_lat, lng: ride.pickup_lng }}
          zoom={14}
          onLoad={onMapLoad}
          options={{
            styles: darkMapStyle,
            disableDefaultUI: true,
            zoomControl: false,
            mapTypeControl: false,
            scaleControl: false,
            streetViewControl: false,
            rotateControl: false,
            fullscreenControl: false,
          }}
        >
          {/* Route polyline */}
          {routePath.length > 0 && (
            <Polyline
              path={routePath}
              options={{
                strokeColor: '#FACC15',
                strokeOpacity: 1,
                strokeWeight: 5,
              }}
            />
          )}

          {/* Driver marker - always show if location exists */}
          {driverLocation && driverLocation.lat && driverLocation.lng && (
            <Marker
              position={{ lat: driverLocation.lat, lng: driverLocation.lng }}
              title="Driver"
            />
          )}

          {/* Pickup marker */}
          <Marker
            position={{ lat: ride.pickup_lat, lng: ride.pickup_lng }}
            label={{ text: 'P', color: 'white' }}
            title="Pickup"
          />

          {/* Dropoff marker */}
          <Marker
            position={{ lat: ride.dropoff_lat, lng: ride.dropoff_lng }}
            label={{ text: 'D', color: 'white' }}
            title="Dropoff"
            }}
          />
        </GoogleMap>
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-yellow-400"></div>
        </div>
      )}

      {/* Top Status Bar */}
      <div className="absolute top-0 left-0 right-0 p-4 z-10">
        <div className={`${statusInfo.color} text-white px-4 py-3 rounded-2xl flex items-center justify-between shadow-lg`}>
          <div className="flex items-center gap-2">
            <span className="text-xl">{statusInfo.icon}</span>
            <span className="font-semibold">{statusInfo.text}</span>
          </div>
          {eta !== '--' && ride.status !== 'completed' && ride.status !== 'cancelled' && (
            <div className="bg-white/20 px-3 py-1 rounded-full text-sm">
              ETA: {eta}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Card */}
      <div className="absolute bottom-0 left-0 right-0 z-10">
        <div className="bg-zinc-900 rounded-t-3xl shadow-2xl border-t border-zinc-800">
          {/* Handle bar */}
          <div className="flex justify-center py-2">
            <div className="w-12 h-1 bg-zinc-700 rounded-full"></div>
          </div>

          <div className="px-4 pb-6 space-y-4">
            {/* Driver info */}
            {ride.driver && (
              <div className="flex items-center gap-3 bg-zinc-800 rounded-2xl p-3">
                <div className="w-14 h-14 bg-yellow-400 rounded-full flex items-center justify-center relative">
                  <span className="text-2xl">🚗</span>
                  {driverLocation && (
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-zinc-800"></div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold truncate">{ride.driver.full_name}</p>
                  <p className="text-zinc-400 text-sm">
                    {ride.driver.vehicle_model} • {ride.driver.vehicle_number}
                    {driverLocation && <span className="text-green-400 ml-2">● Live</span>}
                  </p>
                </div>
                <a
                  href={`tel:${ride.driver.phone}`}
                  className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0"
                >
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </a>
              </div>
            )}

            {/* Route info */}
            <div className="bg-zinc-800 rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <div className="w-0.5 h-8 bg-zinc-600 my-1"></div>
                  <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                </div>
                <div className="flex-1 space-y-4">
                  <div>
                    <p className="text-zinc-500 text-xs font-medium">PICKUP</p>
                    <p className="text-white font-medium">{ride.pickup_name}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500 text-xs font-medium">DROPOFF</p>
                    <p className="text-white font-medium">{ride.dropoff_name}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Branding */}
            <div className="flex items-center justify-center gap-2 pt-2">
              <div className="w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4 text-black" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                </svg>
              </div>
              <span className="text-zinc-500 text-sm font-medium">MyRide Live Tracking</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
