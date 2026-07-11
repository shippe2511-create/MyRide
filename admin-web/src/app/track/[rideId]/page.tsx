'use client';

import { useEffect, useState, useCallback } from 'react';
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
  customer_id: string;
  driver?: {
    full_name: string;
    phone: string;
    vehicle_number: string;
    vehicle_model: string;
  };
  customer?: {
    full_name: string;
  };
}

interface DriverLocation {
  lat: number;
  lng: number;
  heading?: number;
  updated_at?: string;
}

const mapContainerStyle = {
  width: '100%',
  height: '100%',
  minHeight: '300px',
};

const defaultCenter = { lat: 4.1755, lng: 73.5093 }; // Maldives

export default function TrackingPage() {
  const params = useParams();
  const rideId = params.rideId as string;

  const [ride, setRide] = useState<RideData | null>(null);
  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [eta, setEta] = useState<string>('--');
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [routePath, setRoutePath] = useState<{lat: number; lng: number}[]>([]);

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
  });

  const onMapLoad = useCallback((map: google.maps.Map) => {
    setMap(map);
  }, []);

  // Fetch ride data
  useEffect(() => {
    async function fetchRide() {
      try {
        // First fetch the ride
        const { data: rideData, error: rideError } = await supabase
          .from('rides')
          .select('*')
          .eq('id', rideId)
          .single();

        if (rideError) throw rideError;
        if (!rideData) throw new Error('Ride not found');

        // Fetch driver profile if exists
        let driverProfile = null;
        if (rideData.driver_id) {
          const { data: driverData } = await supabase
            .from('profiles')
            .select('full_name, phone, vehicle_number, vehicle_model')
            .eq('id', rideData.driver_id)
            .single();
          driverProfile = driverData;
        }

        // Fetch customer profile if exists
        let customerProfile = null;
        if (rideData.customer_id) {
          const { data: customerData } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', rideData.customer_id)
            .single();
          customerProfile = customerData;
        }

        setRide({
          ...rideData,
          pickup_lat: parseFloat(rideData.pickup_lat) || 4.1755,
          pickup_lng: parseFloat(rideData.pickup_lng) || 73.5093,
          dropoff_lat: parseFloat(rideData.dropoff_lat) || 4.1755,
          dropoff_lng: parseFloat(rideData.dropoff_lng) || 73.5093,
          driver: driverProfile,
          customer: customerProfile,
        });
        setLoading(false);

        // Fetch initial driver location
        if (rideData.driver_id) {
          const { data: locData } = await supabase
            .from('driver_locations')
            .select('lat, lng, heading, last_updated')
            .eq('driver_id', rideData.driver_id)
            .single();

          if (locData && locData.lat && locData.lng) {
            setDriverLocation({
              lat: parseFloat(locData.lat),
              lng: parseFloat(locData.lng),
              heading: locData.heading,
              updated_at: locData.last_updated,
            });
          }
        }
      } catch (err: unknown) {
        console.error('Tracking page error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load ride');
        setLoading(false);
      }
    }

    if (rideId) fetchRide();
  }, [rideId]);

  // Subscribe to ride updates
  useEffect(() => {
    if (!rideId) return;

    const channel = supabase
      .channel(`track_ride_${rideId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rides', filter: `id=eq.${rideId}` },
        (payload) => {
          setRide((prev) => prev ? { ...prev, ...payload.new } : null);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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
          const loc = payload.new as { lat: string; lng: string; heading?: number; last_updated?: string };
          if (loc.lat && loc.lng) {
            setDriverLocation({
              lat: parseFloat(loc.lat),
              lng: parseFloat(loc.lng),
              heading: loc.heading,
              updated_at: loc.last_updated,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ride?.driver_id]);

  // Calculate ETA and route
  useEffect(() => {
    if (!ride || !driverLocation || !isLoaded || !window.google) return;

    const destination = ride.status === 'accepted' || ride.status === 'arrived'
      ? { lat: ride.pickup_lat, lng: ride.pickup_lng }
      : { lat: ride.dropoff_lat, lng: ride.dropoff_lng };

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
          if (route.legs[0]) {
            setEta(route.legs[0].duration?.text || '--');
          }
          const path = route.overview_path.map((p) => ({ lat: p.lat(), lng: p.lng() }));
          setRoutePath(path);
        }
      }
    );
  }, [ride, driverLocation, isLoaded]);

  // Fit bounds when map and locations are ready
  useEffect(() => {
    if (!map || !ride) return;

    const bounds = new google.maps.LatLngBounds();
    bounds.extend({ lat: ride.pickup_lat, lng: ride.pickup_lng });
    bounds.extend({ lat: ride.dropoff_lat, lng: ride.dropoff_lng });
    if (driverLocation) {
      bounds.extend({ lat: driverLocation.lat, lng: driverLocation.lng });
    }
    map.fitBounds(bounds, 50);
  }, [map, ride, driverLocation]);

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return 'Waiting for driver';
      case 'accepted': return 'Driver is on the way';
      case 'arrived': return 'Driver has arrived';
      case 'in_progress': return 'Trip in progress';
      case 'completed': return 'Trip completed';
      case 'cancelled': return 'Trip cancelled';
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-500';
      case 'accepted': return 'bg-blue-500';
      case 'arrived': return 'bg-green-500';
      case 'in_progress': return 'bg-purple-500';
      case 'completed': return 'bg-green-600';
      case 'cancelled': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-yellow-400"></div>
      </div>
    );
  }

  if (error || !ride) {
    return (
      <div className="min-h-screen bg-zinc-900 flex items-center justify-center p-4">
        <div className="bg-zinc-800 rounded-2xl p-6 text-center max-w-md">
          <div className="text-red-400 text-xl mb-2">Ride Not Found</div>
          <p className="text-zinc-400">{error || 'This tracking link is invalid or has expired.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-900 flex flex-col">
      {/* Header */}
      <div className="bg-zinc-800 px-4 py-3 flex items-center gap-3 border-b border-zinc-700">
        <div className="w-10 h-10 bg-yellow-400 rounded-full flex items-center justify-center">
          <svg className="w-6 h-6 text-zinc-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <div>
          <h1 className="text-white font-semibold">MyRide Live Tracking</h1>
          <p className="text-zinc-400 text-sm">Ride #{rideId.slice(0, 8)}</p>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative min-h-[50vh] bg-zinc-800">
        {isLoaded && ride.pickup_lat && ride.pickup_lng ? (
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={driverLocation || { lat: ride.pickup_lat, lng: ride.pickup_lng }}
            zoom={14}
            onLoad={onMapLoad}
            options={{
              styles: [
                { elementType: 'geometry', stylers: [{ color: '#212121' }] },
                { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
                { elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
                { elementType: 'labels.text.stroke', stylers: [{ color: '#212121' }] },
                { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#2c2c2c' }] },
                { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#373737' }] },
                { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3c3c3c' }] },
                { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#000000' }] },
              ],
              disableDefaultUI: true,
              zoomControl: true,
            }}
          >
            {/* Driver marker */}
            {driverLocation && (
              <Marker
                position={{ lat: driverLocation.lat, lng: driverLocation.lng }}
                icon={{
                  url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
                    <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="20" cy="20" r="18" fill="#facc15" stroke="#000" stroke-width="2"/>
                      <path d="M20 10 L28 26 L20 22 L12 26 Z" fill="#000"/>
                    </svg>
                  `),
                  scaledSize: new google.maps.Size(40, 40),
                  anchor: new google.maps.Point(20, 20),
                }}
              />
            )}

            {/* Pickup marker */}
            <Marker
              position={{ lat: ride.pickup_lat, lng: ride.pickup_lng }}
              icon={{
                url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
                  <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="16" cy="16" r="14" fill="#22c55e" stroke="#fff" stroke-width="2"/>
                    <circle cx="16" cy="16" r="6" fill="#fff"/>
                  </svg>
                `),
                scaledSize: new google.maps.Size(32, 32),
                anchor: new google.maps.Point(16, 16),
              }}
            />

            {/* Dropoff marker */}
            <Marker
              position={{ lat: ride.dropoff_lat, lng: ride.dropoff_lng }}
              icon={{
                url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
                  <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="16" cy="16" r="14" fill="#ef4444" stroke="#fff" stroke-width="2"/>
                    <rect x="12" y="12" width="8" height="8" fill="#fff"/>
                  </svg>
                `),
                scaledSize: new google.maps.Size(32, 32),
                anchor: new google.maps.Point(16, 16),
              }}
            />

            {/* Route line */}
            {routePath.length > 0 && (
              <Polyline
                path={routePath}
                options={{
                  strokeColor: '#facc15',
                  strokeOpacity: 0.8,
                  strokeWeight: 4,
                }}
              />
            )}
          </GoogleMap>
        ) : (
          <div className="w-full h-full bg-zinc-800 flex items-center justify-center flex-col gap-4">
            <img
              src={`https://maps.googleapis.com/maps/api/staticmap?center=${ride.pickup_lat},${ride.pickup_lng}&zoom=13&size=600x400&maptype=roadmap&markers=color:green%7C${ride.pickup_lat},${ride.pickup_lng}&markers=color:red%7C${ride.dropoff_lat},${ride.dropoff_lng}&path=color:0xfacc15%7Cweight:4%7C${ride.pickup_lat},${ride.pickup_lng}%7C${ride.dropoff_lat},${ride.dropoff_lng}&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&style=feature:all%7Celement:geometry%7Ccolor:0x212121&style=feature:water%7Ccolor:0x000000`}
              alt="Route map"
              className="w-full max-w-md rounded-lg"
            />
            <p className="text-zinc-500 text-sm">Loading live map...</p>
          </div>
        )}

        {/* Status badge */}
        <div className="absolute top-4 left-4 right-4">
          <div className={`${getStatusColor(ride.status)} text-white px-4 py-2 rounded-full text-center font-medium shadow-lg`}>
            {getStatusText(ride.status)}
          </div>
        </div>
      </div>

      {/* Info panel */}
      <div className="bg-zinc-800 rounded-t-3xl p-4 space-y-4 border-t border-zinc-700">
        {/* ETA */}
        {ride.status !== 'completed' && ride.status !== 'cancelled' && (
          <div className="flex items-center justify-between bg-zinc-900 rounded-xl p-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-400/20 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-zinc-400 text-sm">Estimated arrival</p>
                <p className="text-white font-semibold">{eta}</p>
              </div>
            </div>
          </div>
        )}

        {/* Driver info */}
        {ride.driver && (
          <div className="flex items-center gap-3 bg-zinc-900 rounded-xl p-3">
            <div className="w-12 h-12 bg-zinc-700 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-white font-medium">{ride.driver.full_name}</p>
              <p className="text-zinc-400 text-sm">{ride.driver.vehicle_model} • {ride.driver.vehicle_number}</p>
            </div>
            <a
              href={`tel:${ride.driver.phone}`}
              className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center"
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </a>
          </div>
        )}

        {/* Locations */}
        <div className="bg-zinc-900 rounded-xl p-3 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-3 h-3 bg-green-500 rounded-full mt-1.5"></div>
            <div>
              <p className="text-zinc-400 text-xs">PICKUP</p>
              <p className="text-white">{ride.pickup_name}</p>
            </div>
          </div>
          <div className="ml-1.5 border-l-2 border-dashed border-zinc-600 h-4"></div>
          <div className="flex items-start gap-3">
            <div className="w-3 h-3 bg-red-500 rounded-full mt-1.5"></div>
            <div>
              <p className="text-zinc-400 text-xs">DROPOFF</p>
              <p className="text-white">{ride.dropoff_name}</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-zinc-500 text-xs">
          Powered by MyRide
        </p>
      </div>
    </div>
  );
}
