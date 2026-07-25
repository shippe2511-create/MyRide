import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface Document {
  id: string;
  driver_id: string;
  document_type: string;
  expiry_date: string;
  status: string;
}

interface Driver {
  id: string;
  profile_id: string;
  profiles: {
    full_name: string;
  };
}

async function queueNotification(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
) {
  const { error } = await supabase.from("push_notification_queue").insert({
    user_id: userId,
    title,
    body,
    data: data || {},
    status: "pending",
    attempts: 0,
  });

  if (error) {
    console.error("Failed to queue notification:", error);
  }
  return !error;
}

async function checkAndNotify() {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  // Calculate date thresholds
  const in30Days = new Date(today);
  in30Days.setDate(in30Days.getDate() + 30);
  const in30DaysStr = in30Days.toISOString().split("T")[0];

  const in7Days = new Date(today);
  in7Days.setDate(in7Days.getDate() + 7);
  const in7DaysStr = in7Days.toISOString().split("T")[0];

  const in1Day = new Date(today);
  in1Day.setDate(in1Day.getDate() + 1);
  const in1DayStr = in1Day.toISOString().split("T")[0];

  // Get all documents with expiry dates
  const { data: documents, error: docError } = await supabase
    .from("documents")
    .select(`
      id,
      driver_id,
      document_type,
      expiry_date,
      status
    `)
    .not("expiry_date", "is", null)
    .eq("status", "approved");

  if (docError) {
    console.error("Error fetching documents:", docError);
    return { error: docError.message };
  }

  if (!documents || documents.length === 0) {
    return { message: "No documents to check", processed: 0 };
  }

  // Get driver profile IDs for notifications
  const driverIds = [...new Set(documents.map((d) => d.driver_id))];
  const { data: drivers } = await supabase
    .from("drivers")
    .select("id, profile_id, profiles(full_name)")
    .in("id", driverIds);

  const driverMap = new Map<string, Driver>();
  (drivers || []).forEach((d: any) => driverMap.set(d.id, d));

  // Get already sent reminders
  const { data: sentReminders } = await supabase
    .from("document_expiry_reminders")
    .select("document_id, reminder_type");

  const sentSet = new Set(
    (sentReminders || []).map((r) => `${r.document_id}:${r.reminder_type}`)
  );

  let notificationsSent = 0;
  const results: string[] = [];

  for (const doc of documents as Document[]) {
    const driver = driverMap.get(doc.driver_id);
    if (!driver?.profile_id) continue;

    const expiryDate = new Date(doc.expiry_date);
    const daysUntilExpiry = Math.ceil(
      (expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    let reminderType: string | null = null;
    let title = "";
    let body = "";

    // Determine which reminder to send
    if (daysUntilExpiry < 0) {
      // Already expired
      const daysSinceExpiry = Math.abs(daysUntilExpiry);

      // First expired notification
      if (!sentSet.has(`${doc.id}:expired`)) {
        reminderType = "expired";
        title = `${doc.document_type} Expired`;
        body = `Your ${doc.document_type} expired on ${doc.expiry_date}. Please renew immediately.`;
      }
      // Weekly reminder for expired docs (every 7 days after expiry)
      else if (daysSinceExpiry % 7 === 0 && daysSinceExpiry > 0) {
        const weekNum = Math.floor(daysSinceExpiry / 7);
        const weekKey = `expired_week_${weekNum}`;
        if (!sentSet.has(`${doc.id}:${weekKey}`)) {
          reminderType = weekKey;
          title = `${doc.document_type} Still Expired`;
          body = `Your ${doc.document_type} has been expired for ${daysSinceExpiry} days. Please renew urgently.`;
        }
      }
    } else if (daysUntilExpiry === 0) {
      // Expires today
      if (!sentSet.has(`${doc.id}:today`)) {
        reminderType = "today";
        title = `${doc.document_type} Expires Today`;
        body = `Your ${doc.document_type} expires today! Please renew immediately.`;
      }
    } else if (daysUntilExpiry === 1) {
      // Expires tomorrow
      if (!sentSet.has(`${doc.id}:1_day`)) {
        reminderType = "1_day";
        title = `${doc.document_type} Expires Tomorrow`;
        body = `Your ${doc.document_type} expires tomorrow (${doc.expiry_date}). Please renew soon.`;
      }
    } else if (daysUntilExpiry <= 7) {
      // Expires within 7 days
      if (!sentSet.has(`${doc.id}:7_days`)) {
        reminderType = "7_days";
        title = `${doc.document_type} Expiring Soon`;
        body = `Your ${doc.document_type} expires in ${daysUntilExpiry} days (${doc.expiry_date}). Please plan to renew.`;
      }
    } else if (daysUntilExpiry <= 30) {
      // Expires within 30 days
      if (!sentSet.has(`${doc.id}:30_days`)) {
        reminderType = "30_days";
        title = `${doc.document_type} Expiry Notice`;
        body = `Your ${doc.document_type} expires in ${daysUntilExpiry} days (${doc.expiry_date}).`;
      }
    }

    // Send notification if needed
    if (reminderType) {
      const queued = await queueNotification(driver.profile_id, title, body, {
        type: "document_expiry",
        document_id: doc.id,
        document_type: doc.document_type,
        expiry_date: doc.expiry_date,
      });

      if (queued) {
        // Record that we sent this reminder
        await supabase.from("document_expiry_reminders").insert({
          document_id: doc.id,
          driver_id: doc.driver_id,
          reminder_type: reminderType,
        });

        notificationsSent++;
        results.push(
          `${doc.document_type} (${reminderType}) -> ${driver.profiles?.full_name || driver.profile_id}`
        );
      }
    }
  }

  return {
    checked: documents.length,
    notificationsSent,
    results,
  };
}

serve(async (req) => {
  if (req.method === "POST" || req.method === "GET") {
    try {
      const result = await checkAndNotify();
      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    } catch (error) {
      console.error("Error:", error);
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
