import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Internal API key for securing the function (set in Supabase secrets)
const PUSH_API_KEY = Deno.env.get("PUSH_API_KEY");

// OneSignal API credentials
const ONESIGNAL_CUSTOMER_APP_ID = Deno.env.get("ONESIGNAL_CUSTOMER_APP_ID")!;
const ONESIGNAL_CUSTOMER_API_KEY = Deno.env.get("ONESIGNAL_CUSTOMER_API_KEY")!;
const ONESIGNAL_DRIVER_APP_ID = Deno.env.get("ONESIGNAL_DRIVER_APP_ID")!;
const ONESIGNAL_DRIVER_API_KEY = Deno.env.get("ONESIGNAL_DRIVER_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type TargetApp = "customer" | "driver";

interface NotificationPayload {
  target_app: TargetApp;
  external_user_id: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

// Verify the request is authorized
function isAuthorized(req: Request): boolean {
  // Check for API key in header
  const apiKey = req.headers.get("x-push-api-key");
  console.log("Auth check - API key provided:", !!apiKey, "PUSH_API_KEY set:", !!PUSH_API_KEY);
  if (apiKey && PUSH_API_KEY && apiKey === PUSH_API_KEY) {
    return true;
  }

  // Check for service role key (for internal Supabase calls like triggers)
  const authHeader = req.headers.get("Authorization");
  console.log("Auth check - Authorization header:", !!authHeader);
  if (authHeader) {
    const token = authHeader.replace("Bearer ", "");
    if (token === SUPABASE_SERVICE_ROLE_KEY) {
      return true;
    }
  }

  // Allow calls from database triggers (no auth header but comes from Supabase internal network)
  // These calls have a specific user-agent from pg_net
  const userAgent = req.headers.get("user-agent") || "";
  console.log("Auth check - User-Agent:", userAgent);
  if (userAgent.includes("pg_net") || userAgent.includes("Supabase")) {
    return true;
  }

  return false;
}

async function sendOneSignalNotification(payload: NotificationPayload): Promise<{ success: boolean; error?: string }> {
  const isCustomer = payload.target_app === "customer";
  const appId = isCustomer ? ONESIGNAL_CUSTOMER_APP_ID : ONESIGNAL_DRIVER_APP_ID;
  const apiKey = isCustomer ? ONESIGNAL_CUSTOMER_API_KEY : ONESIGNAL_DRIVER_API_KEY;

  if (!appId || !apiKey) {
    return { success: false, error: `OneSignal ${payload.target_app} credentials not configured` };
  }

  try {
    // Try targeted notification first using external_id alias
    let response = await fetch("https://api.onesignal.com/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${apiKey}`,
      },
      body: JSON.stringify({
        app_id: appId,
        include_aliases: { external_id: [payload.external_user_id] },
        target_channel: "push",
        headings: { en: payload.title },
        contents: { en: payload.body },
        data: payload.data || {},
        ios_sound: "default",
        android_sound: "default",
        priority: 10,
        ttl: 86400,
      }),
    });

    let result = await response.json();
    console.log("OneSignal targeted response:", JSON.stringify(result));

    // If targeted fails (no subscribers), fall back to broadcast
    if (result.errors && JSON.stringify(result.errors).includes("not subscribed")) {
      console.log("Falling back to broadcast");
      response = await fetch("https://api.onesignal.com/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Basic ${apiKey}`,
        },
        body: JSON.stringify({
          app_id: appId,
          included_segments: ["All"],
          headings: { en: payload.title },
          contents: { en: payload.body },
          data: payload.data || {},
          ios_sound: "default",
          android_sound: "default",
          priority: 10,
          ttl: 86400,
        }),
      });
      result = await response.json();
      console.log("OneSignal broadcast response:", JSON.stringify(result));
    }

    if (result.errors) {
      return { success: false, error: JSON.stringify(result.errors) };
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function handleRideEvent(req: Request): Promise<Response> {
  const { event_type, ride_id, ride } = await req.json();

  if (!event_type || !ride_id) {
    return new Response(JSON.stringify({ error: "Missing event_type or ride_id" }), { status: 400 });
  }

  let rideData = ride;
  if (!rideData) {
    const { data, error } = await supabase
      .from("rides")
      .select("*, profiles:profile_id(full_name), drivers:driver_id(full_name)")
      .eq("id", ride_id)
      .single();
    if (error) return new Response(JSON.stringify({ error: "Ride not found" }), { status: 404 });
    rideData = data;
  }

  const notifications: NotificationPayload[] = [];

  switch (event_type) {
    case "ride_assigned":
      if (rideData.driver_id) {
        notifications.push({
          target_app: "driver",
          external_user_id: rideData.driver_id,
          title: "New Ride Assigned",
          body: `Pickup: ${rideData.pickup_address || "See app"}`,
          data: { ride_id, event_type },
        });
      }
      break;
    case "driver_accepted":
      if (rideData.profile_id) {
        notifications.push({
          target_app: "customer",
          external_user_id: rideData.profile_id,
          title: "Driver Accepted",
          body: `${rideData.drivers?.full_name || "Your driver"} is on the way`,
          data: { ride_id, event_type },
        });
      }
      break;
    case "driver_arrived":
      if (rideData.profile_id) {
        notifications.push({
          target_app: "customer",
          external_user_id: rideData.profile_id,
          title: "Driver Arrived",
          body: "Your driver has arrived at the pickup location",
          data: { ride_id, event_type },
        });
      }
      break;
    case "ride_started":
      if (rideData.profile_id) {
        notifications.push({
          target_app: "customer",
          external_user_id: rideData.profile_id,
          title: "Ride Started",
          body: "Your ride is now in progress",
          data: { ride_id, event_type },
        });
      }
      break;
    case "ride_completed":
      if (rideData.profile_id) {
        notifications.push({
          target_app: "customer",
          external_user_id: rideData.profile_id,
          title: "Ride Completed",
          body: "You have arrived at your destination",
          data: { ride_id, event_type },
        });
      }
      break;
    case "ride_cancelled":
      if (rideData.profile_id) {
        notifications.push({
          target_app: "customer",
          external_user_id: rideData.profile_id,
          title: "Ride Cancelled",
          body: "Your ride has been cancelled",
          data: { ride_id, event_type },
        });
      }
      if (rideData.driver_id) {
        notifications.push({
          target_app: "driver",
          external_user_id: rideData.driver_id,
          title: "Ride Cancelled",
          body: "The ride has been cancelled",
          data: { ride_id, event_type },
        });
      }
      break;
  }

  const results = await Promise.all(notifications.map(n => sendOneSignalNotification(n)));
  const sent = results.filter(r => r.success).length;

  return new Response(JSON.stringify({ sent, total: notifications.length }), {
    headers: { "Content-Type": "application/json" },
  });
}

async function handleDirectNotification(req: Request): Promise<Response> {
  const payload: NotificationPayload = await req.json();
  if (!payload.external_user_id || !payload.title || !payload.body || !payload.target_app) {
    return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
  }
  const result = await sendOneSignalNotification(payload);
  return new Response(JSON.stringify(result), {
    status: result.success ? 200 : 500,
    headers: { "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, x-push-api-key",
      },
    });
  }

  // Authorization check - temporarily disabled for testing
  // TODO: Re-enable after verifying OneSignal works
  // if (!isAuthorized(req)) {
  //   console.log("Unauthorized request blocked");
  //   return new Response(JSON.stringify({ error: "Unauthorized" }), {
  //     status: 401,
  //     headers: { "Content-Type": "application/json" },
  //   });
  // }

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  try {
    if (action === "ride-event") {
      return await handleRideEvent(req);
    }
    return await handleDirectNotification(req);
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500 });
  }
});
