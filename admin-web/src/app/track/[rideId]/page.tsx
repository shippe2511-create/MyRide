import { createClient } from '@supabase/supabase-js';
import TrackingClient from './tracking-client';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface PageProps {
  params: Promise<{ rideId: string }>;
}

export default async function TrackingPage({ params }: PageProps) {
  const { rideId } = await params;

  // Fetch ride data server-side
  const { data: rideData, error: rideError } = await supabase
    .from('rides')
    .select('*')
    .eq('id', rideId)
    .single();

  if (rideError || !rideData) {
    return (
      <div className="h-screen bg-black flex flex-col items-center justify-center text-white p-4">
        <p className="text-red-400 text-xl">Ride not found</p>
        <p className="text-zinc-500 text-sm mt-2">ID: {rideId}</p>
      </div>
    );
  }

  // Fetch driver info if assigned
  let driverName = 'Driver';
  let vehicleInfo = '';
  let driverPhone = '';
  let driverLat: number | null = null;
  let driverLng: number | null = null;

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

    const { data: loc } = await supabase
      .from('driver_locations')
      .select('lat, lng')
      .eq('driver_id', rideData.driver_id)
      .single();

    if (loc?.lat && loc?.lng) {
      driverLat = parseFloat(String(loc.lat));
      driverLng = parseFloat(String(loc.lng));
    }
  }

  const initialData = {
    id: rideData.id,
    status: rideData.status,
    pickup_name: rideData.pickup_name || 'Pickup location',
    dropoff_name: rideData.dropoff_name || 'Destination',
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
  };

  return <TrackingClient rideId={rideId} initialData={initialData} />;
}
