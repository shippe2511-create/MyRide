const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://lwkndyyfmmrzazdvrsnk.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

if (!SUPABASE_SERVICE_KEY || !GOOGLE_API_KEY) {
  console.error('Set SUPABASE_SERVICE_KEY and GOOGLE_API_KEY env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function reverseGeocode(lat, lng) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status === 'OK' && data.results?.length > 0) {
    return data.results[0].formatted_address;
  }
  return null;
}

async function main() {
  const { data: rides, error } = await supabase
    .from('rides')
    .select('id, pickup_lat, pickup_lng, pickup_name')
    .in('pickup_name', ['Malé, Maldives', 'Maldives', 'Hulhumalé, Maldives', 'Current location'])
    .not('pickup_lat', 'is', null);

  if (error) {
    console.error('Query error:', error);
    return;
  }

  console.log(`Found ${rides.length} rides to fix`);

  const cache = new Map();
  let updated = 0;
  let failed = 0;

  for (const ride of rides) {
    const key = `${parseFloat(ride.pickup_lat).toFixed(5)},${parseFloat(ride.pickup_lng).toFixed(5)}`;

    let address = cache.get(key);
    if (!address) {
      address = await reverseGeocode(ride.pickup_lat, ride.pickup_lng);
      if (address) {
        cache.set(key, address);
      }
      await new Promise(r => setTimeout(r, 100));
    }

    if (address && address !== ride.pickup_name) {
      const { error: updateError } = await supabase
        .from('rides')
        .update({ pickup_name: address })
        .eq('id', ride.id);

      if (updateError) {
        console.error(`Failed to update ${ride.id}:`, updateError.message);
        failed++;
      } else {
        console.log(`Updated ${ride.id}: ${address}`);
        updated++;
      }
    } else if (!address) {
      console.log(`No address for ${ride.id} at ${ride.pickup_lat}, ${ride.pickup_lng}`);
      failed++;
    }
  }

  console.log(`\nDone. Updated: ${updated}, Failed: ${failed}, Cached locations: ${cache.size}`);
}

main().catch(console.error);
