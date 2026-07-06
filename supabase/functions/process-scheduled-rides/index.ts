import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date().toISOString();

    // Find all scheduled rides where scheduled_time has passed
    const { data: ridesToProcess, error: fetchError } = await supabase
      .from("rides")
      .select("id, customer_id, pickup_address, dropoff_address, scheduled_time")
      .eq("status", "scheduled")
      .lte("scheduled_time", now);

    if (fetchError) {
      throw fetchError;
    }

    if (!ridesToProcess || ridesToProcess.length === 0) {
      return new Response(
        JSON.stringify({ message: "No scheduled rides to process", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const processedIds: string[] = [];
    const errors: { id: string; error: string }[] = [];

    for (const ride of ridesToProcess) {
      // Update ride status from 'scheduled' to 'pending'
      const { error: updateError } = await supabase
        .from("rides")
        .update({
          status: "pending",
          updated_at: now
        })
        .eq("id", ride.id)
        .eq("status", "scheduled"); // Double-check status to avoid race conditions

      if (updateError) {
        errors.push({ id: ride.id, error: updateError.message });
      } else {
        processedIds.push(ride.id);

        // Create notification for the customer
        await supabase.from("notifications").insert({
          user_id: ride.customer_id,
          title: "Scheduled ride is now active",
          body: `Your scheduled ride to ${ride.dropoff_address} is now being matched with drivers.`,
          type: "ride_update",
          data: { ride_id: ride.id },
        });
      }
    }

    return new Response(
      JSON.stringify({
        message: `Processed ${processedIds.length} scheduled rides`,
        processed: processedIds.length,
        processedIds,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
