# Push Notifications Setup

## What's Done

1. **Database tables created:**
   - `push_tokens` — stores FCM device tokens per user
   - `push_notification_queue` — pending notifications to send

2. **Auto-queue trigger:** When a ride status changes, notifications are automatically queued:
   - `accepted` → Customer: "Driver Found!"
   - `arrived` → Customer: "Driver Arrived"
   - `in_progress` → Customer: "Trip Started"
   - `completed` → Customer: "Trip Completed"
   - `cancelled` → Other party notified

3. **Edge Function:** `supabase/functions/send-push-notifications/index.ts`

## What You Need To Do

### 1. Set Up Firebase

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a project (or use existing)
3. Add iOS app: `com.myride.customer` (or your bundle ID)
4. Add Android app: `com.myride.customer`
5. Download `GoogleService-Info.plist` (iOS) and `google-services.json` (Android)
6. Enable Cloud Messaging in Firebase Console

### 2. Get FCM Server Key

1. Firebase Console → Project Settings → Cloud Messaging
2. Copy the **Server Key** (legacy key)

### 3. Add Secret to Supabase

```bash
supabase secrets set FCM_SERVER_KEY=your_server_key_here
```

Or via Dashboard: Edge Functions → Secrets → Add `FCM_SERVER_KEY`

### 4. Deploy Edge Function

```bash
cd /Users/athifabdulla/Downloads/MyRide
supabase functions deploy send-push-notifications
```

### 5. Set Up Scheduled Invocation (pg_cron)

Run this SQL in Supabase SQL Editor:

```sql
-- Enable pg_cron extension (if not already)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule function to run every minute
SELECT cron.schedule(
  'process-push-queue',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://lwkndyyfmmrzazdvrsnk.supabase.co/functions/v1/send-push-notifications',
    headers := '{"Authorization": "Bearer ' || current_setting('supabase.service_role_key') || '"}'::jsonb
  );
  $$
);
```

### 6. Configure Flutter Apps

Both `flutter_app` and `driver_app` already have token registration code. Just add Firebase:

```bash
# In each app directory
flutterfire configure
```

Then add to `main.dart`:
```dart
await Firebase.initializeApp();
final fcmToken = await FirebaseMessaging.instance.getToken();
if (fcmToken != null) {
  await SupabaseService.registerFcmToken(fcmToken);
}
```

## Testing

1. Book a ride in customer app
2. Accept it in driver app
3. Customer should receive "Driver Found!" push notification
