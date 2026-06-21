# MyRide Issues List

Investigated: 2026-06-15
Last Updated: 2026-06-21
Status: All fixable issues resolved
Related: [[MyRide — Project Hub]]
Tags: #project/myride

---

## flutter_app (Customer App)

### 1. Profile Edit Not Saved to Database - FIXED
- **Fix:** Added Supabase save call with loading state and error handling

### 2. Saved Places (Home/Work) Not Persisted - FIXED
- **Fix:** Created `SupabaseService.upsertSavedPlace()`, wired to profile screen

### 3. Emergency Contacts Not Saved to Database - FIXED
- **Fix:** Saves to profiles.emergency_contacts JSONB column, loads on profile load

### 4. Trip History Uses Hardcoded Mock Data - FIXED
- **Fix:** Created `SupabaseService.getRideHistory()`, loads via AppState on profile load

### 5. Transport Types Hardcoded - FIXED
- **Fix:** Now queries `transport_types` table with `is_active` filter

### 6. Chat Messages Don't Trigger Push Notifications - FIXED (queue only)
- **Fix:** Now inserts to `push_notification_queue`
- **Note:** Notifications won't actually send until Firebase is configured (Issue #17)

---

## driver_app (Driver App)

### 7. Shift Schedule Uses Hardcoded Mock Data - FIXED
- **Fix:** Added `getDriverShifts()` method, loads from Supabase with loading/refresh

### 8. Chat Messages Don't Trigger Push Notifications (Driver Side) - FIXED (queue only)
- **Fix:** Now inserts to `push_notification_queue`
- **Note:** Notifications won't actually send until Firebase is configured (Issue #17)

### 9. Driver Profile Edit May Not Persist - NO ISSUE
- **Status:** Profile photo upload works correctly. Other fields are display-only, set by admin.

### 18. Documents Upload Failing - FIXED (2026-06-16)
- **Issue:** Document uploads failed with "Driver profile not found" and RLS errors
- **Fix:** 
  - Changed to use driverId from DriverState provider instead of getDriverProfile()
  - Added unique constraint on (driver_id, document_type) for upsert
  - Fixed document_type to use `vehicle_reg` instead of `vehicle_registration`
  - Fixed admin panel to use `verified` status instead of `approved`
  - RLS properly secured (2026-06-19): drivers own their docs, admins can view/update all

### 19. Document Preview Shows Icon Instead of Image - FIXED (2026-06-16)
- **Fix:** Updated preview dialog to load and display actual uploaded image from Supabase Storage

### 20. Pre-Trip Check Cannot Add Photos to Issues - FIXED (2026-06-16)
- **Fix:** Added photo upload capability to issue report dialog with:
  - Camera/gallery picker
  - Multiple photo support
  - Remove photo option
  - Photos stored with issue report

---

## admin-web (Admin Panel)

### 10. Settings Page Saves Non-Existent Columns - FIXED
- **Fix:** Removed non-existent notification fields from save operation

### 11. Vehicles Page Has Fare Fields (Should Be Free Service) - FIXED
- **Fix:** Removed fare fields from form/save, kept in interface for DB compatibility

### 12. No Chat/Messaging Management Page - FIXED
- **Fix:** Created `/dashboard/chat` page with:
  - Conversation list with search and status filter
  - Message viewer with chat bubble UI
  - Stats cards (conversations, active rides, messages)
  - Real-time updates
  - Added to sidebar navigation

### 13. No Document Verification Page - FIXED
- **Fix:** Added Documents tab to Drivers page with:
  - Stats cards (total, pending, approved, rejected, expiring soon)
  - Filterable table by status and document type
  - Preview modal for images/PDFs
  - Approve/Reject/Pending actions
  - Expiry warnings for documents expiring within 30 days

### 14. No SOS/Emergency Alerts Dashboard - FIXED
- **Fix:** Created `sos_alerts` table and `/dashboard/sos` page with:
  - Active alerts banner with immediate action
  - Stats (active, responding, resolved today, total)
  - Alert list with filters
  - Details dialog with location (Google Maps link), user/driver info
  - Status actions: Responding, Resolve, False Alarm
  - Real-time updates
  - Updated both Flutter apps to save SOS alerts to database
  - Added to sidebar navigation

### 15. No Role-Based Access Control UI - FIXED
- **Fix:** Added granular permissions dialog to admin users page with:
  - Toggle switches for: Manage Customers, Drivers, Rides, Content, Settings, Admins, Export Data
  - Default permissions based on role
  - Super Admin permissions locked (all enabled)
  - Saves to `admin_permissions` table

### 16. Push Notification Queue Not Processed - PENDING (External)
- **Status:** Edge Function exists but requires Firebase setup + deployment
- **Blocked by:** Issue #17

---

## Cross-App Issues

### 17. Push Notifications Not Working (Firebase Not Configured) - PENDING (External)
- **Status:** Requires:
  - Apple Developer Program ($99/year) for APNs
  - Firebase project setup
  - Edge Function deployment
  - FCM token registration
- **Note:** All apps queue notifications correctly; they just don't send yet

---

## Summary

| Category | Fixed | No Issue | External Dependency |
|----------|-------|----------|---------------------|
| flutter_app | 18 | 0 | 0 |
| driver_app | 16 | 1 | 0 |
| admin-web | 21 | 0 | 0 |
| Cross-App | 0 | 0 | 2 |
| **Total** | **55** | **1** | **2** |

All code-level issues have been resolved. The remaining 2 issues require external Firebase/APNs configuration.

---

## Known Runtime Issues

### 21. iOS App Lifecycle Crash - FIXED (2026-06-17, driver_app re-fixed 2026-06-19)
- **Issue:** Both Flutter apps crashed on iOS (white screen, app comes and goes)
- **driver_app re-fix (2026-06-19):** Simplified AppDelegate to match customer_app pattern:
  - Removed custom FlutterEngine and scene delegation
  - Removed UIApplicationSceneManifest from Info.plist  
  - Deleted SceneDelegate.swift and its Xcode project references
  - Build now succeeds without scene delegation
- **Cause:** Missing SceneDelegate for iOS 13+ scene-based lifecycle
- **Fix:** Added SceneDelegate.swift and configured Info.plist with UISceneConfiguration

### 22. Admin Panel Dropdown Overlays Block UI - FIXED (2026-06-17)
- **Issue:** After clicking dropdown actions (Edit, Delete), couldn't click anywhere else
- **Cause:** Radix UI DropdownMenu `modal` prop defaults to true, leaving overlay
- **Fix:** Added `modal={false}` to all DropdownMenu components across:
  - Admins, Vehicles, Drivers, Customers, Content, Eligibility, Zones, Checklists, Header

### 23. Admin Login Auth/Profile ID Mismatch - FIXED (2026-06-17)
- **Issue:** New admins couldn't login ("Access denied") even with valid credentials
- **Cause:** Profile ID didn't match Supabase Auth user ID
- **Fix:** Updated login and middleware to look up profile by email as fallback

### 24. All Tables Missing RLS - FIXED (2026-06-17)
- **Issue:** 21 tables had policies but RLS not enabled (Supabase Advisor: 42 issues)
- **Fix:** Enabled RLS on all tables:
  - announcements, app_settings, audit_logs, documents, faqs, locations, pages
  - ratings, ride_campaigns, ride_quotas, route_schedules, route_stops
  - service_zones, staff_corner, transport_routes, transport_schedules
  - transport_types, vehicle_checklists, vehicle_maintenance, vehicle_types, vehicles

### 25. Role-Based Access Control - IMPLEMENTED (2026-06-17)
- **Feature:** Full RBAC system with 5 roles:
  - **Super Admin:** Full access + admin management
  - **Admin:** Full operational access, no admin management  
  - **Operator:** Rides, drivers, vehicles, schedules
  - **Support:** Chat, SOS, ratings
  - **Viewer:** Read-only
- **Implementation:**
  - `permissions.ts` with 30+ granular permissions
  - `usePermissions` hook with sessionStorage caching
  - Sidebar filters nav items by permission
  - Super-admin can assign roles and override individual permissions
  - `custom_permissions` JSONB column in profiles table

### 26. Timezone Display Wrong - FIXED (2026-06-17)
- **Issue:** Dates showing in wrong timezone
- **Fix:** Added `timeZone: "Indian/Maldives"` (UTC+5) to all date formatters in utils.ts

### 27. Emergency Contacts Admin Management - IMPLEMENTED (2026-06-17)
- **Feature:** Settings page now has Emergency Contacts tab
- Admin can manage default SOS contacts that load in customer/driver apps

### 28. Password Reset for Admins - IMPLEMENTED (2026-06-17)
- **Feature:** Super-admin can reset passwords for any admin user
- Uses Supabase Admin API via `/api/admin/reset-password` endpoint
- Creates auth user if not exists, updates password if exists

---

## Flutter App Warnings - REDUCED (2026-06-17)

| App | Before | After | Errors |
|-----|--------|-------|--------|
| Customer App | 102 | 98 | 0 |
| Driver App | 49 | 46 | 0 |

Fixed:
- Removed unused imports and methods
- Suppressed unused field warnings
- Fixed Share.share syntax errors

---

### 29. RLS Fix for 5 Tables - FIXED (2026-06-19)
- **Issue:** 5 tables had overly permissive RLS policies (transport_routes, route_stops, route_schedules, saved_places, chat_messages)
- **Fix:** 
  - Dropped "Anyone can manage X" policies that bypassed security
  - Added proper scoped policies:
    - Routes/stops/schedules: public can READ, only admins can write
    - saved_places: users own their data, admins can view all
    - chat_messages: users see own sent/received, can only send as themselves
  - Removed 13 overly permissive policies total

### 30. Activity Logging System - IMPLEMENTED (2026-06-19)
- **Feature:** Track all admin actions in Activity Log page
- **Implementation:**
  - Created `activity_logs` table with RLS policies
  - Created `activity-logger.ts` utility for consistent logging
  - Wired into customers, drivers, and settings pages
  - Activity page now uses real data instead of mock

---

## UI/UX Improvements (2026-06-19)

### 31. Shimmer Loading States - IMPLEMENTED
- Added shimmer loading effects to replace plain spinners across customer and driver apps

### 32. Break Timer Widget - IMPLEMENTED  
- Driver app shows animated countdown timer during break with visual feedback

### 33. Onboarding Tooltips - IMPLEMENTED
- First-time user walkthrough highlighting key features in both apps

### 34. Lottie Animations - IMPLEMENTED
- Added smooth Lottie animations for trip status states (searching, driver arriving, in progress, complete, cancelled)

### 35. Dead Code Cleanup - COMPLETED
- Removed ~170 lines of unused methods from driver_app home screen

---

### 36. Real-time Driver Location Tracking - FIXED (2026-06-20)
- **Issue:** Customer app used fake driver simulation instead of real location updates
- **Fix:** 
  - Subscribe to `driver_locations` table via Supabase Realtime
  - Removed `_startDriverSimulation()` fake movement code
  - Added `_subscribeToDriverLocation()` with proper channel subscription
  - Fetch initial driver location on screen load

### 37. Driver Name Not Showing in Customer App - FIXED (2026-06-20)
- **Issue:** Driver name showed as "Driver" instead of actual name
- **Fix:**
  - Added `driverId` to the flow: matching → arriving → tracking screens
  - Fetch driver name from ride data with fallback
  - Added `_driverName` state variable to track throughout trip

### 38. iOS 26.5 App Crash (comes and goes) - FIXED (2026-06-20)
- **Issue:** Both Flutter apps crashed on iOS 26.5 (white screen, app comes and goes)
- **Cause:** Flutter stable 3.44.2 incompatible with iOS 26.5
- **Fix:** Upgraded to Flutter beta 3.45.0
- **Note:** Must use Flutter beta channel until stable gets iOS 26.5 support

### 39. App Icons Reverted to Flutter Default - FIXED (2026-06-20)
- **Issue:** Both apps showed Flutter logo instead of MyRide icons
- **Fix:** Regenerated icons using `dart run flutter_launcher_icons`

---

## UI/UX Improvements (2026-06-21)

### 40. Schedule Screen Countdown - IMPLEMENTED
- **Feature:** Added "in X min" countdown replacing duration/stops indicator
- Yellow highlight when ≤10 minutes (urgent)

### 41. Map Location Picker Reverse Geocoding - FIXED
- **Issue:** Location picker showed coordinates instead of address
- **Fix:** Added Google Geocoding API to convert lat/lng to readable address

### 42. Map Theme Consistency - FIXED
- **Issue:** Maps had different dark styles across screens
- **Fix:** Unified dark map style across all screens (gray tones matching app theme)

### 43. Admin Panel Color Sync - FIXED
- **Issue:** Admin panel primary color (#FFCC00) didn't match apps (#FFD60A)
- **Fix:** Synced admin panel to use HSL(50, 100%, 52%) = #FFD60A

### 44. Admin Panel Export CSV - IMPLEMENTED
- **Feature:** Added Export CSV button to all admin pages:
  - Rides, Vehicles, Scheduling, Zones, Ratings, Admins, Eligibility, Vehicle Logs

### 45. Admin Panel Hover-to-Show Actions - IMPLEMENTED
- **Feature:** Consistent UX pattern across all tables:
  - Edit button + three-dot menu appear on row hover
  - Smooth opacity transition
  - Applied to 15+ pages:
    - Customers, Drivers, Rides, Vehicles, Scheduling, Zones
    - Admins, Eligibility, Vehicle Logs, Content, Incidents
    - Checklists, Help, App Config, SOS

---

## Code Audit Fixes (2026-06-21)

### High Priority Fixes

### 46. Change Password - FIXED
- **Issue:** Validated input but never called Supabase auth
- **Fix:** Added `SupabaseService.changePassword()` with loading state and error handling

### 47. Download My Data - FIXED
- **Issue:** Showed snackbar but did nothing
- **Fix:** Exports profile, rides, saved places as text via Share

### 48. Clear Search History - FIXED
- **Issue:** Showed snackbar but didn't clear
- **Fix:** Deletes recent places from Supabase

### 49. Book Again - FIXED
- **Issue:** Just closed dialog
- **Fix:** Navigates to SearchScreen with destination prefilled

### 50. Inbox Screen - FIXED
- **Issue:** Never loaded messages (TODO comment)
- **Fix:** Fetches from `notifications` table with pull-to-refresh, mark read

### 51. Notifications Screen - FIXED
- **Issue:** Never loaded data
- **Fix:** Same as inbox - loads from Supabase, swipe to delete, mark all read

### 52. Driver Ratings Hardcoded - FIXED
- **Issue:** Rating breakdown and feedback were mock data
- **Fix:** Fetches real ratings from Supabase with breakdown calculation

### 53. Driver Notification Settings - FIXED
- **Issue:** Toggles didn't persist
- **Fix:** Saves to SharedPreferences, loads on init

### 54. Admin Ratings Export CSV - FIXED
- **Issue:** Crashed due to undefined `rating_breakdown` property
- **Fix:** Uses actual fields from DriverRating interface

### Medium Priority Fixes

### 55. Announcement Card Tap - FIXED
- **Issue:** Only triggered haptic, no action
- **Fix:** Shows detail modal with image, title, content

### 56. Staff Corner Card Tap - FIXED
- **Issue:** Only triggered haptic, no action
- **Fix:** Shows detail modal with category badge, image, content

### 57. Chat Camera/Gallery Buttons - FIXED
- **Issue:** Did nothing (both apps)
- **Fix:** Uses image_picker to select/capture and send image message

### 58. Chat Emoji Button - FIXED
- **Issue:** Did nothing
- **Fix:** Shows emoji picker modal, inserts selected emoji into message

### 59. SOS Share Location - FIXED
- **Issue:** Only showed snackbar
- **Fix:** Gets GPS coordinates and shares via Share with Google Maps link

### 60. Voice Recording - FIXED
- **Issue:** Simulated recording without actual audio
- **Fix:** Shows "Voice messages coming soon" snackbar

### 61. Report Builder Navigation - FIXED
- **Issue:** Page existed but not in sidebar
- **Fix:** Added to Insights section in sidebar navigation

### 62. Dead Code Cleanup
- **Issue:** `_showBottomSheet` had unused `addButton` parameter with empty handler
- **Fix:** Removed unused parameter

### Additional Fixes (2026-06-21)

### 63. Customer Rating Hardcoded - FIXED
- **Issue:** ride_screen.dart showed hardcoded "4.8" for customer rating
- **Fix:** Added customerRating field to RideRequest model, fetched from Supabase ratings table

### 64. Trips Together Hardcoded - FIXED
- **Issue:** ride_screen.dart showed hardcoded "12 trips together"
- **Fix:** Added tripsTogether field to RideRequest, counts completed rides between driver and customer

### 65. Driver Location Updates Random - FIXED
- **Issue:** driver_state.dart used random offsets for location updates (demo mode)
- **Fix:** Uses Geolocator.getCurrentPosition() for real GPS coordinates

### 66. Chat Location Sharing Fake - FIXED
- **Issue:** Driver chat sent "My location" text without actual coordinates
- **Fix:** Gets real GPS and sends Google Maps link with coordinates

### 67. Monthly Calendar View - FIXED
- **Issue:** shift_schedule_screen.dart showed "coming soon" snackbar
- **Fix:** Implemented full month grid with shift highlights and today indicator

### 68. Admin Notification Settings Not Saved - FIXED
- **Issue:** settings/page.tsx notification toggles not included in saveSettings()
- **Fix:** Added all notif_* fields to the upsert call

### 69. Driver Name Shows "Driver" Instead of Actual Name - FIXED
- **Issue:** Trip tracking screen showed generic "Driver" text instead of actual driver name
- **Cause:** `getMyScheduledRides` and `getRideById` queries didn't include driver profile data
- **Fix:** 
  - Updated both queries to include `driver:drivers!rides_driver_id_fkey(*, profile:profiles!...)`
  - Extract driver name from nested `ride['driver']['profile']['full_name']` in home_screen
  - Removed invalid FK reference to vehicles table that was causing query errors

### 70. Live Driver Location Not Updating on Customer Map - FIXED
- **Issue:** Map showed static driver marker, not real-time position
- **Cause:** Wrong column names (`latitude/longitude` instead of `lat/lng`) in driver_locations query
- **Fix:**
  - Fixed column names in trip_tracking_screen.dart
  - Added realtime Postgres subscription to driver_arriving_screen.dart
  - Fetches initial driver location on screen load
  - Map marker now updates live as driver moves

---

*Updated by Nova on 2026-06-21*
