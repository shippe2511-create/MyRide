'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function TrackingPage() {
  const params = useParams();
  const rideId = params.rideId as string;

  const [ride, setRide] = useState<any>(null);
  const [driverLat, setDriverLat] = useState<number | null>(null);
  const [driverLng, setDriverLng] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        // Get ride
        const { data: rideData, error: rideError } = await supabase
          .from('rides')
          .select('*')
          .eq('id', rideId)
          .single();

        if (rideError || !rideData) {
          setError('Ride not found');
          setLoading(false);
          return;
        }

        // Get driver profile
        let driverName = 'Driver';
        let vehicleInfo = '';
        let driverPhone = '';
        if (rideData.driver_id) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, phone, vehicle_number, vehicle_model')
            .eq('id', rideData.driver_id)
            .single();
          if (profile) {
            driverName = profile.full_name || 'Driver';
            vehicleInfo = `${profile.vehicle_model || ''} ${profile.vehicle_number || ''}`.trim();
            driverPhone = profile.phone || '';
          }

          // Get driver location
          const { data: loc } = await supabase
            .from('driver_locations')
            .select('lat, lng')
            .eq('driver_id', rideData.driver_id)
            .single();

          if (loc?.lat && loc?.lng) {
            setDriverLat(parseFloat(String(loc.lat)));
            setDriverLng(parseFloat(String(loc.lng)));
          }
        }

        setRide({
          ...rideData,
          driverName,
          vehicleInfo,
          driverPhone,
          pickup_lat: parseFloat(String(rideData.pickup_lat)),
          pickup_lng: parseFloat(String(rideData.pickup_lng)),
          dropoff_lat: parseFloat(String(rideData.dropoff_lat)),
          dropoff_lng: parseFloat(String(rideData.dropoff_lng)),
        });
        setLoading(false);
      } catch (e) {
        setError('Failed to load');
        setLoading(false);
      }
    }

    fetchData();

    // Subscribe to driver location updates
    const channel = supabase
      .channel('driver_location_updates')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'driver_locations' },
        (payload: any) => {
          if (payload.new?.lat && payload.new?.lng) {
            setDriverLat(parseFloat(String(payload.new.lat)));
            setDriverLng(parseFloat(String(payload.new.lng)));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [rideId]);

  if (loading) {
    return (
      <div className="h-screen bg-black flex items-center justify-center">
        <div className="animate-spin h-10 w-10 border-4 border-yellow-400 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (error || !ride) {
    return (
      <div className="h-screen bg-black flex items-center justify-center text-white">
        <div className="text-center">
          <p className="text-red-400 text-xl">{error || 'Ride not found'}</p>
        </div>
      </div>
    );
  }

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  // Build map URL with markers
  let mapUrl = `https://maps.googleapis.com/maps/api/staticmap?size=640x400&scale=2&maptype=roadmap`;
  mapUrl += `&markers=color:green|label:P|${ride.pickup_lat},${ride.pickup_lng}`;
  mapUrl += `&markers=color:red|label:D|${ride.dropoff_lat},${ride.dropoff_lng}`;

  if (driverLat && driverLng) {
    mapUrl += `&markers=color:yellow|label:C|${driverLat},${driverLng}`;
    mapUrl += `&path=color:0xFFCC00|weight:4|${driverLat},${driverLng}|${ride.status === 'in_progress' ? `${ride.dropoff_lat},${ride.dropoff_lng}` : `${ride.pickup_lat},${ride.pickup_lng}`}`;
  }

  mapUrl += `&style=feature:all|element:geometry|color:0x212121`;
  mapUrl += `&style=feature:water|color:0x000000`;
  mapUrl += `&style=feature:road|element:geometry|color:0x333333`;
  mapUrl += `&key=${apiKey}`;

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
    <div className="min-h-screen bg-zinc-900 flex flex-col">
      {/* Header */}
      <div className="bg-zinc-800 p-4 flex items-center gap-3">
        <div className="w-10 h-10 bg-yellow-400 rounded-full flex items-center justify-center">
          <span className="text-xl">📍</span>
        </div>
        <div>
          <h1 className="text-white font-bold">MyRide Tracking</h1>
          <p className="text-zinc-400 text-sm">#{rideId.slice(0, 8)}</p>
        </div>
      </div>

      {/* Status */}
      <div className={`${statusColors[ride.status] || 'bg-gray-500'} text-white text-center py-3 font-semibold`}>
        {statusText[ride.status] || ride.status}
        {driverLat && driverLng && <span className="ml-2 text-sm opacity-80">● LIVE</span>}
      </div>

      {/* Map */}
      <div className="flex-1 min-h-[300px] relative">
        <img src={mapUrl} alt="Map" className="w-full h-full object-cover" />
        {driverLat && driverLng && (
          <div className="absolute top-2 left-2 bg-black/80 text-yellow-400 px-3 py-1 rounded-full text-sm">
            🚗 Driver: {driverLat.toFixed(4)}, {driverLng.toFixed(4)}
          </div>
        )}
      </div>

      {/* Bottom Card */}
      <div className="bg-zinc-800 rounded-t-3xl p-4 space-y-4">
        {/* Driver */}
        <div className="flex items-center gap-3 bg-zinc-900 rounded-xl p-3">
          <div className="w-12 h-12 bg-yellow-400 rounded-full flex items-center justify-center text-2xl">
            🚗
          </div>
          <div className="flex-1">
            <p className="text-white font-semibold">{ride.driverName}</p>
            <p className="text-zinc-400 text-sm">{ride.vehicleInfo || 'Vehicle info'}</p>
          </div>
          {ride.driverPhone && (
            <a href={`tel:${ride.driverPhone}`} className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
              <span className="text-white">📞</span>
            </a>
          )}
        </div>

        {/* Route */}
        <div className="bg-zinc-900 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              <div className="w-0.5 h-6 bg-zinc-600"></div>
              <div className="w-3 h-3 bg-red-500 rounded-full"></div>
            </div>
            <div className="flex-1 space-y-4">
              <div>
                <p className="text-zinc-500 text-xs">PICKUP</p>
                <p className="text-white">{ride.pickup_name || 'Pickup'}</p>
              </div>
              <div>
                <p className="text-zinc-500 text-xs">DROP-OFF</p>
                <p className="text-white">{ride.dropoff_name || 'Destination'}</p>
              </div>
            </div>
          </div>
        </div>

        <p className="text-center text-zinc-600 text-xs">Powered by MyRide</p>
      </div>
    </div>
  );
}
