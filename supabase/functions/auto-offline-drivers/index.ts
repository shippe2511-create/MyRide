import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async () => {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("driver_locations")
    .update({ is_online: false })
    .eq("is_online", true)
    .lt("last_updated", fiveMinutesAgo)
    .select("driver_id");

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({
      message: `Set ${data?.length || 0} stale drivers offline`,
      affected: data?.length || 0,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
});
