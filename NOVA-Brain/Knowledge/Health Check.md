# MyRide — Engineering Health Check

Last Updated: 2026-06-16
Related: [[MyRide — Project Hub]] | [[Project State]] | [[Issues]]
Tags: #project/myride #engineering

---

## Build Status

| Component | Status | Notes |
|-----------|--------|-------|
| flutter_app | ✅ Builds | iOS debug/release both pass |
| driver_app | ✅ Builds | iOS debug/release pass, runtime issue on iOS 26.5 |
| admin-web | ✅ Builds | Next.js dev server runs on localhost:3000 |
| Supabase | ✅ Online | Project: lwkndyyfmmrzazdvrsnk |

---

## Secrets & Security

### What's Safe
- Supabase anon key used in Flutter apps (public, rate-limited)
- Supabase anon key in admin-web (client-side, public)
- `.gitignore` excludes `.env`, `node_modules`, build artifacts

### What to Protect
- Supabase service_role key (NEVER in client code)
- Any future Firebase credentials
- Apple Developer certificates/keys

### Current .gitignore Coverage
```
**/.env
**/.env.local
**/.env*.local
**/*service_role*
**/*secret*key*
**/credentials.json
**/*.pem
**/*.p12
```

---

## Row Level Security (RLS) Status

| Table | RLS Enabled | Policy Status |
|-------|-------------|---------------|
| profiles | ✅ | Working |
| drivers | ✅ | Working |
| driver_locations | ✅ | Working |
| rides | ✅ | Working |
| documents | ❌ | Disabled for development |
| sos_alerts | ✅ | Working |
| chat_conversations | ⚠️ | Needs review |
| chat_messages | ⚠️ | Needs review |
| transport_routes | ⚠️ | Needs review |
| route_stops | ⚠️ | Needs review |
| route_schedules | ⚠️ | Needs review |
| saved_places | ⚠️ | Needs review |

**Action Required:** Re-enable RLS on `documents` table with proper policies before production.

---

## Schema Consistency

### Recent Changes (2026-06-16)
- Added unique constraint on `documents(driver_id, document_type)` for upsert support
- Document status values: `pending`, `verified`, `rejected` (not `approved`)
- Document types: `license`, `vehicle_reg`, `insurance`, `id_card`, `profile_photo`, `police_clearance`

### Potential Drift Points
- `profiles` table is shared across all three apps — changes affect everyone
- `drivers.is_online` and `driver_locations.is_online` must stay in sync

---

## Dead Code & Cleanup

### Known Unused Code
- `_loadMockData()` in driver_app DriverState (disabled, commented)
- Firebase imports commented out in both Flutter apps
- Some unused widget files may exist

### Recently Removed
- Fare/pricing fields removed from admin vehicles page (free service)

---

## Dependencies

### Flutter Apps
- Flutter: 3.44.2 (stable)
- Dart: 3.11.x
- 37+ packages with newer versions available (minor updates)

### Admin Web
- Next.js: 15.x
- React: 19.x
- TypeScript: 5.x
- @radix-ui components for UI
- sonner for toasts

---

## Performance Notes

- Driver location polling: 5-second intervals when online
- Auto-offline stale drivers: pg_cron job every minute (drivers not updated in 5 min)
- Supabase Realtime used for ride requests and admin updates

---

*Updated by Nova on 2026-06-16*
