import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
const TWILIO_PHONE_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function isValidMaldivesPhone(phone: string): boolean {
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.startsWith("960")) {
    const local = cleaned.substring(3);
    return local.length === 7 && (local.startsWith("7") || local.startsWith("9"));
  }
  return cleaned.length === 7 && (cleaned.startsWith("7") || cleaned.startsWith("9"));
}

function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.startsWith("960")) {
    return `+${cleaned}`;
  }
  return `+960${cleaned}`;
}

async function sendTwilioSMS(to: string, body: string): Promise<boolean> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
    console.error("Twilio credentials not configured");
    return false;
  }

  try {
    const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          "Authorization": `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: to,
          From: TWILIO_PHONE_NUMBER,
          Body: body,
        }),
      }
    );

    const result = await response.json();
    if (result.sid) {
      console.log(`SMS sent successfully: ${result.sid}`);
      return true;
    } else {
      console.error("Twilio error:", result);
      return false;
    }
  } catch (error) {
    console.error("SMS send error:", error);
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { phone, action } = await req.json();

    if (!phone) {
      return new Response(
        JSON.stringify({ success: false, error: "Phone number required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!isValidMaldivesPhone(phone)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid Maldives phone number" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalizedPhone = normalizePhone(phone);

    if (action === "send") {
      const { data: otpResult, error: otpError } = await supabase.rpc("generate_otp", {
        p_phone: normalizedPhone,
      });

      if (otpError || !otpResult?.success) {
        return new Response(
          JSON.stringify({ success: false, error: otpResult?.error || "Failed to generate OTP" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const code = otpResult.code;
      const message = `Your MyRide verification code is: ${code}. Valid for 5 minutes.`;

      const smsSent = await sendTwilioSMS(normalizedPhone, message);

      if (!smsSent) {
        console.log(`DEV MODE: OTP for ${normalizedPhone} is ${code}`);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "OTP sent successfully",
          dev_mode: !smsSent,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else if (action === "verify") {
      const { code } = await req.json();

      if (!code || code.length !== 6) {
        return new Response(
          JSON.stringify({ success: false, error: "6-digit code required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: verifyResult, error: verifyError } = await supabase.rpc("verify_otp", {
        p_phone: normalizedPhone,
        p_code: code,
      });

      if (verifyError) {
        return new Response(
          JSON.stringify({ success: false, error: "Verification failed" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify(verifyResult),
        {
          status: verifyResult?.success ? 200 : 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Invalid action. Use 'send' or 'verify'" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
