# MyRide Issues List

Investigated: 2026-06-15
Status: Pending fixes (work one page at a time, pause for testing)

---

## flutter_app (Customer App)

### 1. Profile Edit Not Saved to Database
- **Symptom:** User edits name/email in profile, shows "Profile updated" but changes are lost after app restart
- **Cause:** `_showEditProfile()` calls `appState.updateUserName()` / `updateUserEmail()` which only update local state, never call Supabase
- **Files:** `lib/screens/profile_screen.dart:554-556`, `lib/providers/app_state.dart:230-244`
- **Fix size:** Small — add `SupabaseService.updateProfile()` call

### 2. Saved Places (Home/Work) Not Persisted
- **Symptom:** Home/Work addresses reset after app restart
- **Cause:** `updateHomeAddress()` / `updateWorkAddress()` only update local state in AppState, never call Supabase `saved_places` table
- **Files:** `lib/screens/profile_screen.dart:850-851`, `lib/providers/app_state.dart:253-261`
- **Fix size:** Small — wire to `SupabaseService.addSavedPlace()`

### 3. Emergency Contacts Not Saved to Database
- **Symptom:** Adding emergency contact shows success but doesn't persist
- **Cause:** `_addEmergencyContact()` only updates local AppState, not the `emergency_contacts` JSONB field in profiles
- **Files:** `lib/screens/profile_screen.dart:1043`, `lib/providers/app_state.dart`
- **Fix size:** Small — call `SupabaseService.updateProfile()` with emergency_contacts

### 4. Trip History Uses Hardcoded Mock Data
- **Symptom:** Activity screen shows same fake trips regardless of actual ride history
- **Cause:** `AppState._tripHistory` is hardcoded list, not loaded from `rides` table
- **Files:** `lib/providers/app_state.dart:265-271`
- **Fix size:** Medium — replace with Supabase query for completed rides

### 5. Transport Types Hardcoded
- **Symptom:** Schedule screen always shows same 3 transport types even if admin changes them
- **Cause:** `getTransportTypes()` returns hardcoded list instead of querying `transport_types` table
- **Files:** `lib/services/supabase_service.dart:509-515`
- **Fix size:** Small — query from database

### 6. Chat Messages Don't Trigger Push Notifications
- **Symptom:** User only sees new messages by manually opening chat screen
- **Cause:** `sendChatMessage()` inserts to `chat_messages` but doesn't queue push notification; no database trigger exists for chat
- **Files:** `lib/services/supabase_service.dart:634-656`
- **Fix size:** Medium — add push notification queue insert after message, or create DB trigger

---

## driver_app (Driver App)

### 7. Shift Schedule Uses Hardcoded Mock Data
- **Symptom:** Driver sees same weekly schedule regardless of actual assigned shifts
- **Cause:** `ShiftScheduleScreen._weekSchedule` is hardcoded list, not loaded from `shifts` table
- **Files:** `lib/screens/shift_schedule_screen.dart:17-44`
- **Fix size:** Medium — load from Supabase `shifts` table

### 8. Chat Messages Don't Trigger Push Notifications (Driver Side)
- **Symptom:** Driver only sees customer messages by opening chat manually
- **Cause:** Same as issue #6 — `sendChatMessage()` doesn't queue push notification
- **Files:** `lib/services/supabase_service.dart:677-700`
- **Fix size:** Medium — add push notification queue insert

### 9. Driver Profile Edit May Not Persist
- **Symptom:** Need to verify if driver profile name/phone changes are saved
- **Cause:** Profile screen uploads avatar to Supabase but may not save other fields
- **Files:** `lib/screens/profile_screen.dart`
- **Fix size:** Small — verify and wire if needed

---

## admin-web (Admin Panel)

### 10. Settings Page Saves Non-Existent Columns
- **Symptom:** Saving settings fails silently or errors for notification fields
- **Cause:** Settings page tries to save `notif_ride_request`, `notif_ride_accepted`, etc. but `app_settings` table only has: `id, company_name, support_phone, support_email, max_ride_distance_km, default_wait_time_min, require_driver_approval, require_customer_approval, enable_sos, enable_chat, enable_ratings, updated_at`
- **Files:** `src/app/dashboard/settings/page.tsx:103-107`
- **Fix size:** Small — remove non-existent fields from save, or add columns to DB

### 11. Vehicles Page Has Fare Fields (Should Be Free Service)
- **Symptom:** Admin can set base_fare, per_km_rate, min_fare on vehicle types
- **Cause:** Violates "no fares" constraint — these fields exist in UI and DB but shouldn't be editable/visible
- **Files:** `src/app/dashboard/vehicles/page.tsx:32-35, 96-99, 152-155, 179-182`
- **Fix size:** Small — hide fare fields from UI (DB columns can stay at 0)

### 12. No Chat/Messaging Management Page
- **Symptom:** Admin cannot view ride conversations or intervene in disputes
- **Cause:** No admin page exists to query `chat_messages` table
- **Files:** Missing page at `src/app/dashboard/chat/page.tsx`
- **Fix size:** Large — create new page with message viewing

### 13. No Document Verification Page
- **Symptom:** Admin cannot approve/reject driver documents
- **Cause:** Drivers page mentions "documents" but no actual verification UI exists
- **Files:** Missing page or tab for `documents` table
- **Fix size:** Medium — add documents tab to drivers page or separate page

### 14. No SOS/Emergency Alerts Dashboard
- **Symptom:** Admin has no way to see or respond to SOS alerts from rides
- **Cause:** No admin page monitors emergency situations
- **Files:** Missing
- **Fix size:** Large — create SOS dashboard page

### 15. No Role-Based Access Control UI
- **Symptom:** All admins see all pages; no way to restrict permissions
- **Cause:** `admin_permissions` table exists but no UI to manage it
- **Files:** Missing permissions management in admins page
- **Fix size:** Medium — add permissions UI to admin management

### 16. Push Notification Queue Not Processed
- **Symptom:** 24 notifications stuck in `pending` status
- **Cause:** Edge Function `send-push-notifications` exists but not deployed/scheduled; FCM_SERVER_KEY not configured
- **Files:** `supabase/functions/send-push-notifications/index.ts`, `supabase/PUSH_NOTIFICATIONS_SETUP.md`
- **Fix size:** Medium — requires Firebase setup + Edge Function deployment + pg_cron scheduling

---

## Cross-App Issues

### 17. Push Notifications Not Working (Firebase Not Configured)
- **Symptom:** No push notifications work anywhere (ride updates, chat, etc.)
- **Cause:** Firebase disabled in both apps (commented out in main.dart), FCM tokens not registered, Edge Function not deployed
- **Files:** `flutter_app/lib/main.dart`, `driver_app/lib/main.dart`, `supabase/PUSH_NOTIFICATIONS_SETUP.md`
- **Fix size:** Large — requires Apple Developer Program ($99/year) for APNs, Firebase project setup, Edge Function deployment

---

## Priority Order (Suggested)

**High Priority (Core Functionality):**
1. #1 Profile Edit Not Saved
2. #2 Saved Places Not Persisted
3. #6/#8 Chat Push Notifications (needs #16/#17 first for actual push)
4. #10 Settings Page Broken Fields
5. #11 Hide Fare Fields

**Medium Priority (Data Integrity):**
6. #3 Emergency Contacts
7. #4 Trip History
8. #7 Shift Schedule
9. #5 Transport Types

**Lower Priority (Admin Features):**
10. #13 Document Verification
11. #15 Role-Based Access
12. #12 Chat Management
13. #14 SOS Dashboard

**Requires External Setup:**
- #16/#17 Push Notifications (Firebase + Apple Developer Program)

---

*Updated by Nova on 2026-06-15*
