# MyRide — Decisions Log

Last Updated: 2026-06-19
Related: [[MyRide — Project Hub]] | [[Project State]]
Tags: #project/myride #decisions

---

## Working Rules (Established by Athif)

These rules are **mandatory** for all MyRide development:

### 1. No Dead Buttons or Fields, Ever
Every button, field, toggle, and feature must be fully wired and functional before calling it done:
- Connected to Supabase (correct table/RPC)
- Save/load working
- Validation in place
- Loading and error states
- Clear user feedback (success/error messages)

Never leave a control as a visual placeholder. If you cannot fully wire something, say so explicitly.

### 2. Connect to Admin Portal
Features that should be manageable from admin-web must actually be wired to it, not just built in the app in isolation.

### 3. Fix Incrementally, Never All at Once
When fixing bugs, work ONE issue (or one page) at a time:
- Explain the fix
- Make the change
- PAUSE for testing before moving on
- Do not batch unrelated fixes across many files

### 4. Verify, Don't Assume
Before saying something is fixed, trace the data flow end to end:
- UI → Supabase → back
- State what you checked

### 5. Keep the Vault Updated
As issues are found and fixed, record them in NOVA-Brain vault so state persists across sessions.

### 6. Read Before Write
Never scaffold or regenerate code that already exists. When unsure, inspect the actual files first, then ask one clear question.

---

## Key Technical Decisions

### Authentication: Phone-Based, Not Supabase Auth
**Decision:** Use phone numbers matched against `profiles` table instead of Supabase Auth
**Rationale:** Corporate environment with pre-registered users; simpler onboarding flow
**Implementation:** 
- Store phone in profiles
- Driver links via `drivers.profile_id`
- No Supabase Auth session — use SharedPreferences for local state
- `driverId` stored in DriverState provider and synced to SupabaseService

### Free Service: No Fares or Payments
**Decision:** Remove all fare/pricing logic
**Rationale:** This is a corporate free-ride service; eligibility/quota replaces billing
**Implementation:**
- Removed fare fields from admin vehicles page
- No payment integration needed

### Document Status Values
**Decision:** Use `pending`, `verified`, `rejected` (not `approved`)
**Rationale:** Database constraint requires these exact values
**Implementation:** Admin panel uses `verified` for approval action

### Driver Online Status: Dual Table Sync
**Decision:** Update both `drivers.is_online` AND `driver_locations.is_online`
**Rationale:** Admin panel queries `driver_locations` for live status; apps may query either
**Implementation:** `updateDriverStatus()` updates both tables

### Auto-Offline Stale Drivers
**Decision:** pg_cron job marks drivers offline if `last_updated > 5 minutes`
**Rationale:** Prevents stale "online" drivers showing in customer app
**Implementation:** SQL function `auto_offline_stale_drivers()` runs every minute

### Push Notifications: Queued but Disabled
**Decision:** Queue notifications to `push_notification_queue` but don't process yet
**Rationale:** Requires Apple Developer Program ($99/year) + Firebase setup
**Implementation:** All notification code in place; just needs external configuration

---

## Session Decisions

### 2026-06-16
- **Disabled NotificationService** in driver_app main.dart to test if it causes crash — did not fix white screen
- **Upgraded Flutter** to 3.44.2 to test iOS 26.5 compatibility — did not fix white screen
- **RLS disabled on documents table** temporarily for development — needs re-enabling before production

### 2026-06-15
- Created SOS dashboard in admin-web
- Created Chat monitoring page in admin-web
- Added granular permissions to admin users
- Fixed all document upload issues

---

### 2026-06-19
- **Fixed RLS on 5 tables** — Removed overly permissive policies, added proper scoped access
- **Activity logging system** — All admin actions now tracked in `activity_logs` table
- **UI/UX polish** — Added shimmer loading, break timer, onboarding tooltips, Lottie animations
- **Code cleanup** — Removed ~170 lines of dead code from driver_app

### 2026-06-20
- **Flutter beta 3.45.0** — Upgraded from stable 3.44.2 for iOS 26.5 compatibility
- **Real-time driver tracking** — Customer app now subscribes to `driver_locations` via Supabase Realtime
- **Driver name fix** — Pass `driverId` through ride flow, fetch name from ride data
- **App icons regenerated** — Used `flutter_launcher_icons` to restore MyRide branding
- **Cleaned 5GB cache** — Removed Xcode DerivedData, Gradle caches

---

*Updated by Nova on 2026-06-20*
