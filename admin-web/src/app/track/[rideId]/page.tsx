'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';

interface RideData {
  id: string;
  status: string;
  pickup_name: string | null;
  dropoff_name: string | null;
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

const SUPABASE_URL = 'https://lwkndyyfmmrzazdvrsnk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx3a25keXlmbW1yemF6ZHZyc25rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMTM0NzAsImV4cCI6MjA5NTg4OTQ3MH0.hIcx_gway6VJrTYV1MAXAbcapgTfxo4zYOwgmS2uChg';
const GOOGLE_MAPS_KEY = 'AIzaSyBZ7HVy2dUvTCC5SZkz0MaFCBON2QorFbI';

export default function TrackingPage() {
  const params = useParams();
  const rideId = params.rideId as string;

  const [ride, setRide] = useState<RideData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [debugInfo, setDebugInfo] = useState<string>('Starting...');

  const fetchData = useCallback(async () => {
    try {
      setDebugInfo('Fetching ride data...');

      // Fetch ride data using REST API
      const rideRes = await fetch(
        `${SUPABASE_URL}/rest/v1/rides?id=eq.${rideId}&select=*`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          },
        }
      );

      if (!rideRes.ok) {
        setError(`Ride fetch failed: ${rideRes.status}`);
        setLoading(false);
        return;
      }

      const rides = await rideRes.json();
      if (!rides || rides.length === 0) {
        setError('Ride not found');
        setLoading(false);
        return;
      }

      const rideData = rides[0];
      setDebugInfo(`Got ride: ${rideData.status}, driver: ${rideData.driver_id}`);

      let driverName = 'Driver';
      let vehicleInfo = '';
      let driverPhone = '';
      let driverLat: number | null = null;
      let driverLng: number | null = null;

      if (rideData.driver_id) {
        // Fetch driver profile
        const profileRes = await fetch(
          `${SUPABASE_URL}/rest/v1/profiles?id=eq.${rideData.driver_id}&select=full_name,phone,vehicle_number,vehicle_model`,
          {
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            },
          }
        );

        if (profileRes.ok) {
          const profiles = await profileRes.json();
          if (profiles && profiles.length > 0) {
            const profile = profiles[0];
            driverName = profile.full_name || 'Driver';
            vehicleInfo = `${profile.vehicle_model || ''} ${profile.vehicle_number || ''}`.trim();
            driverPhone = profile.phone || '';
          }
        }

        // Fetch driver location
        const locRes = await fetch(
          `${SUPABASE_URL}/rest/v1/driver_locations?driver_id=eq.${rideData.driver_id}&select=lat,lng`,
          {
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            },
          }
        );

        if (locRes.ok) {
          const locs = await locRes.json();
          if (locs && locs.length > 0) {
            driverLat = parseFloat(String(locs[0].lat));
            driverLng = parseFloat(String(locs[0].lng));
            setDebugInfo(`Driver location: ${driverLat}, ${driverLng}`);
          }
        }
      }

      setRide({
        id: rideData.id,
        status: rideData.status,
        pickup_name: rideData.pickup_name,
        dropoff_name: rideData.dropoff_name,
        pickup_lat: parseFloat(String(rideData.pickup_lat)),
        pickup_lng: parseFloat(String(rideData.pickup_lng)),
        dropoff_lat: parseFloat(String(rideData.dropoff_lat)),
        dropoff_lng: parseFloat(String(rideData.dropoff_lng)),
        driver_id: rideData.driver_id,
        driverName,
        vehicleInfo,
        driverPhone,
        driverLat,
        driverLng,
      });
      setLoading(false);
    } catch (e) {
      setError(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
      setDebugInfo(`Error: ${e}`);
      setLoading(false);
    }
  }, [rideId]);

  useEffect(() => {
    fetchData();

    // Poll for updates every 5 seconds
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="h-screen bg-black flex flex-col items-center justify-center">
        <div className="animate-spin h-10 w-10 border-4 border-yellow-400 border-t-transparent rounded-full mb-4"></div>
        <p className="text-zinc-400 text-sm">{debugInfo}</p>
      </div>
    );
  }

  if (error || !ride) {
    return (
      <div className="h-screen bg-black flex flex-col items-center justify-center text-white p-4">
        <p className="text-red-400 text-xl mb-2">{error || 'Ride not found'}</p>
        <p className="text-zinc-500 text-sm">{debugInfo}</p>
        <button
          onClick={() => { setLoading(true); fetchData(); }}
          className="mt-4 px-4 py-2 bg-yellow-400 text-black rounded-lg"
        >
          Retry
        </button>
      </div>
    );
  }

  // Build Static Map URL
  let mapUrl = `https://maps.googleapis.com/maps/api/staticmap?size=640x480&scale=2&maptype=roadmap`;

  // Add pickup marker (green)
  mapUrl += `&markers=color:green|label:P|${ride.pickup_lat},${ride.pickup_lng}`;

  // Add dropoff marker (red)
  mapUrl += `&markers=color:red|label:D|${ride.dropoff_lat},${ride.dropoff_lng}`;

  // Add driver marker (yellow) if available
  if (ride.driverLat && ride.driverLng) {
    mapUrl += `&markers=color:yellow|label:C|${ride.driverLat},${ride.driverLng}`;

    // Add path from driver to destination
    const targetLat = ride.status === 'in_progress' ? ride.dropoff_lat : ride.pickup_lat;
    const targetLng = ride.status === 'in_progress' ? ride.dropoff_lng : ride.pickup_lng;
    mapUrl += `&path=color:0xFFCC00FF|weight:4|${ride.driverLat},${ride.driverLng}|${targetLat},${targetLng}`;
  }

  // Dark map style
  mapUrl += `&style=feature:all|element:geometry|color:0x242f3e`;
  mapUrl += `&style=feature:all|element:labels.text.stroke|color:0x242f3e`;
  mapUrl += `&style=feature:all|element:labels.text.fill|color:0x746855`;
  mapUrl += `&style=feature:water|element:geometry|color:0x17263c`;
  mapUrl += `&style=feature:road|element:geometry|color:0x38414e`;
  mapUrl += `&style=feature:road|element:geometry.stroke|color:0x212a37`;

  mapUrl += `&key=${GOOGLE_MAPS_KEY}`;

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
        {ride.driverLat && ride.driverLng && (
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

      {/* Map - Takes remaining space */}
      <div className="flex-1 relative min-h-0">
        <img
          src={mapUrl}
          alt="Live tracking map"
          className="w-full h-full object-cover"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
          }}
        />

        {/* Driver coordinates overlay */}
        {ride.driverLat && ride.driverLng && (
          <div className="absolute top-2 left-2 right-2 bg-black/80 text-yellow-400 px-3 py-2 rounded-lg text-sm">
            <div className="flex items-center gap-2">
              <span>🚗</span>
              <span>Driver: {ride.driverLat.toFixed(5)}, {ride.driverLng.toFixed(5)}</span>
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="absolute bottom-2 left-2 bg-black/80 px-3 py-2 rounded-lg text-xs space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 bg-green-500 rounded-full"></span>
            <span className="text-white">Pickup</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 bg-red-500 rounded-full"></span>
            <span className="text-white">Dropoff</span>
          </div>
          {ride.driverLat && ride.driverLng && (
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-yellow-400 rounded-full"></span>
              <span className="text-white">Driver</span>
            </div>
          )}
        </div>
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
                <p className="text-white text-sm truncate">{ride.pickup_name || 'Pickup location'}</p>
              </div>
              <div>
                <p className="text-zinc-500 text-xs">DROP-OFF</p>
                <p className="text-white text-sm truncate">{ride.dropoff_name || 'Destination'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
