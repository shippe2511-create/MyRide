'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

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
}

interface DriverLocation {
  lat: number;
  lng: number;
}

export default function TrackingPage() {
  const params = useParams();
  const rideId = params.rideId as string;

  const [ride, setRide] = useState<RideData | null>(null);
  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

        // Fetch driver profile
        let driverProfile = null;
        if (rideData.driver_id) {
          const { data: driverData } = await supabase
            .from('profiles')
            .select('full_name, phone, vehicle_number, vehicle_model')
            .eq('id', rideData.driver_id)
            .single();
          driverProfile = driverData;

          // Fetch driver location
          const { data: locData } = await supabase
            .from('driver_locations')
            .select('lat, lng')
            .eq('driver_id', rideData.driver_id)
            .single();

          if (locData && locData.lat && locData.lng) {
            setDriverLocation({
              lat: parseFloat(locData.lat),
              lng: parseFloat(locData.lng),
            });
          }
        }

        setRide({
          ...rideData,
          pickup_lat: parseFloat(rideData.pickup_lat) || 4.1755,
          pickup_lng: parseFloat(rideData.pickup_lng) || 73.5093,
          dropoff_lat: parseFloat(rideData.dropoff_lat) || 4.1755,
          dropoff_lng: parseFloat(rideData.dropoff_lng) || 73.5093,
          driver: driverProfile,
        });
        setLoading(false);
      } catch (err: unknown) {
        console.error('Tracking page error:', err);
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
          const loc = payload.new as { lat: string; lng: string };
          if (loc.lat && loc.lng) {
            setDriverLocation({
              lat: parseFloat(loc.lat),
              lng: parseFloat(loc.lng),
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
          setRide((prev) => prev ? { ...prev, ...payload.new } : null);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [rideId]);

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

  // Build static map URL with all markers and route
  const getMapUrl = () => {
    if (!ride) return '';

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    // Markers
    let markers = `markers=color:green%7Clabel:P%7C${ride.pickup_lat},${ride.pickup_lng}`;
    markers += `&markers=color:red%7Clabel:D%7C${ride.dropoff_lat},${ride.dropoff_lng}`;

    if (driverLocation) {
      markers += `&markers=color:0xFACC15%7Clabel:🚗%7C${driverLocation.lat},${driverLocation.lng}`;
    }

    // Route path from pickup to dropoff
    const path = `&path=color:0x4285F4%7Cweight:4%7C${ride.pickup_lat},${ride.pickup_lng}%7C${ride.dropoff_lat},${ride.dropoff_lng}`;

    // Calculate center to fit all markers
    const centerLat = driverLocation
      ? driverLocation.lat
      : (ride.pickup_lat + ride.dropoff_lat) / 2;
    const centerLng = driverLocation
      ? driverLocation.lng
      : (ride.pickup_lng + ride.dropoff_lng) / 2;

    return `https://maps.googleapis.com/maps/api/staticmap?center=${centerLat},${centerLng}&zoom=12&size=600x400&scale=2&maptype=roadmap&${markers}${path}&style=feature:all%7Celement:geometry%7Ccolor:0x242f3e&style=feature:water%7Ccolor:0x17263c&style=feature:road%7Celement:geometry%7Ccolor:0x38414e&key=${apiKey}`;
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

      {/* Status */}
      <div className="px-4 py-2">
        <div className={`${getStatusColor(ride.status)} text-white px-4 py-2 rounded-full text-center font-medium`}>
          {getStatusText(ride.status)}
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 min-h-[50vh] relative">
        <img
          src={getMapUrl()}
          alt="Route map"
          className="w-full h-full object-cover"
        />
        {driverLocation && (
          <div className="absolute top-2 left-2 bg-black/70 px-3 py-1 rounded-full text-white text-sm">
            🚗 Driver location updating live
          </div>
        )}
      </div>

      {/* Info panel */}
      <div className="bg-zinc-800 p-4 space-y-4 border-t border-zinc-700">
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
