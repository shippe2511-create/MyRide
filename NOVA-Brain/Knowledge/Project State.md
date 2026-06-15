# MyRide — Project State

Last Updated: 2026-06-16
Related: [[MyRide — Project Hub]]
Tags: #project/myride

---

## Overview

MyRide is a corporate **free-ride** transport platform with three apps sharing one Supabase backend (Postgres, Auth, RLS, Storage). No fares, payments, or billing — eligibility/quota management replaces all pricing logic.

---

## The Three Apps

### 1. flutter_app (Customer App)
**Location:** `/Users/athifabdulla/Downloads/MyRide/flutter_app`
**Stack:** Flutter (Dart)
**Bundle ID:** `com.myride.staffapp`

**What's Built & Working:**
- Phone-based login (OTP via profiles table, not Supabase Auth)
- Home screen with booking flow
- Search screen with live driver locations from database
- Profile editing (saves to Supabase)
- Saved places (home/work) persistence
- Emergency contacts (JSONB in profiles)
- Trip history from database
- Transport types loaded from `transport_types` table
- SOS alerts (saves to `sos_alerts` table)
- Chat messaging (queues push notifications)

**Known Limitations:**
- Push notifications disabled (requires Apple Developer Program)
- Some UI screens use mock data for edge cases

---

### 2. driver_app (Driver App)
**Location:** `/Users/athifabdulla/Downloads/MyRide/driver_app`
**Stack:** Flutter (Dart)
**Bundle ID:** `com.myride.driverApp`

**What's Built & Working:**
- Phone-based login (matches phone to profiles → drivers table)
- Home screen with online/offline toggle
- Real-time ride requests via Supabase Realtime
- Location tracking and updates to `driver_locations`
- Shift schedule loaded from database
- Documents upload to Supabase Storage with status tracking
- Document preview shows actual uploaded images
- Pre-trip checklist with photo upload for issues
- SOS alerts
- Chat messaging

**Known Limitations:**
- Push notifications disabled
- iOS 26.5 compatibility issue causing white screen on physical device (Flutter toolchain issue, code is correct)
- NotificationService temporarily disabled for testing

---

### 3. admin-web (Admin Panel)
**Location:** `/Users/athifabdulla/Downloads/MyRide/admin-web`
**Stack:** Next.js 15 + TypeScript + Tailwind + shadcn/ui
**URL:** `http://localhost:3000`

**Real Admin Pages (Fully Functional):**
- `/dashboard` — Main dashboard with stats
- `/dashboard/drivers` — Driver management with 3 tabs:
  - All Drivers (list, approve/suspend)
  - Performance (ratings, KPIs, comparisons)
  - Documents (upload verification, approve/reject)
- `/dashboard/customers` — Customer management
- `/dashboard/rides` — Ride history and monitoring
- `/dashboard/vehicles` — Vehicle/fleet management (no fare fields)
- `/dashboard/scheduling` — Route scheduling
- `/dashboard/sos` — SOS emergency dashboard with real-time alerts
- `/dashboard/chat` — Chat monitoring with conversation viewer
- `/dashboard/admins` — Admin user management with granular permissions
- `/dashboard/settings` — System settings
- `/dashboard/reports` — Reports and analytics

**Stub/Placeholder Pages:**
- None currently — all sidebar items are wired to real pages

---

## Database (Supabase)

**Project URL:** `https://lwkndyyfmmrzazdvrsnk.supabase.co`

**Key Tables:**
- `profiles` — All users (customers, drivers, admins)
- `drivers` — Driver-specific data, linked to profiles
- `driver_locations` — Real-time driver positions and online status
- `rides` — All ride requests and history
- `documents` — Driver document uploads with verification status
- `sos_alerts` — Emergency alerts
- `chat_conversations` / `chat_messages` — Messaging
- `ratings` — User ratings and reviews
- `transport_types` — Vehicle categories
- `vehicle_types` — Individual vehicles

**RLS Status:**
- Most tables have RLS enabled
- `documents` table has RLS disabled (temporary for development)
- 5 tables still need RLS review: transport_routes, route_stops, route_schedules, saved_places, chat_messages

---

## Build Status

| App | Builds | Runs | Notes |
|-----|--------|------|-------|
| flutter_app | ✓ | ✓ | Works on iOS device |
| driver_app | ✓ | ⚠ | iOS 26.5 white screen issue |
| admin-web | ✓ | ✓ | localhost:3000 |

---

*Updated by Nova on 2026-06-16*
