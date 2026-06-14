import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FCM_SERVER_KEY = Deno.env.get("FCM_SERVER_KEY"); // Set this in Supabase Dashboard > Edge Functions > Secrets

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface PushNotification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
}

interface PushToken {
  token: string;
  platform: string;
}

async function sendFCMNotification(
  token: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<boolean> {
  if (!FCM_SERVER_KEY) {
    console.error("FCM_SERVER_KEY not configured");
    return false;
  }

  try {
    const response = await fetch("https://fcm.googleapis.com/fcm/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `key=${FCM_SERVER_KEY}`,
      },
      body: JSON.stringify({
        to: token,
        notification: {
          title,
          body,
          sound: "default",
          badge: 1,
        },
        data: data || {},
        priority: "high",
      }),
    });

    const result = await response.json();
    return result.success === 1;
  } catch (error) {
    console.error("FCM send error:", error);
    return false;
  }
}

async function processQueue() {
  // Fetch pending notifications (limit batch size)
  const { data: pending, error: fetchError } = await supabase
    .from("push_notification_queue")
    .select("*")
    .eq("status", "pending")
    .lt("attempts", 3)
    .order("created_at", { ascending: true })
    .limit(50);

  if (fetchError) {
    console.error("Error fetching queue:", fetchError);
    return { processed: 0, errors: [fetchError.message] };
  }

  if (!pending || pending.length === 0) {
    return { processed: 0, errors: [] };
  }

  console.log(`Processing ${pending.length} notifications`);

  let successCount = 0;
  const errors: string[] = [];

  for (const notification of pending as PushNotification[]) {
    // Get user's push tokens
    const { data: tokens, error: tokenError } = await supabase
      .from("push_tokens")
      .select("token, platform")
      .eq("user_id", notification.user_id);

    if (tokenError || !tokens || tokens.length === 0) {
      // No tokens - mark as failed
      await supabase
        .from("push_notification_queue")
        .update({
          status: "failed",
          error_message: "No push tokens found for user",
          attempts: (notification as any).attempts + 1,
        })
        .eq("id", notification.id);
      errors.push(`No tokens for user ${notification.user_id}`);
      continue;
    }

    // Send to all user's devices
    let anySent = false;
    for (const { token } of tokens as PushToken[]) {
      const sent = await sendFCMNotification(
        token,
        notification.title,
        notification.body,
        notification.data || undefined
      );
      if (sent) anySent = true;
    }

    // Update queue status
    await supabase
      .from("push_notification_queue")
      .update({
        status: anySent ? "sent" : "failed",
        sent_at: anySent ? new Date().toISOString() : null,
        error_message: anySent ? null : "FCM delivery failed",
        attempts: (notification as any).attempts + 1,
      })
      .eq("id", notification.id);

    if (anySent) successCount++;
  }

  return { processed: successCount, errors };
}

serve(async (req) => {
  // Allow CRON or manual invocation
  if (req.method === "POST" || req.method === "GET") {
    try {
      const result = await processQueue();
      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    } catch (error) {
      console.error("Queue processing error:", error);
      return new Response(
        JSON.stringify({ error: (error as Error).message }),
        {
          headers: { "Content-Type": "application/json" },
          status: 500,
        }
      );
    }
  }

  return new Response("Method not allowed", { status: 405 });
});
