# MyRide — Project Hub

Tags: #project/myride #hub

---

## Quick Links

- [[Project State]] — App locations, what's built, what works
- [[Issues]] — Bug/issues list by app, prioritized
- [[Health Check]] — Build status, secrets, RLS, schema drift
- [[Decisions Log]] — Key decisions and working rules

---

## What is MyRide?

A corporate **free-ride** transport platform with three apps:

| App | Tech | Purpose |
|-----|------|---------|
| flutter_app | Flutter | Customer app for booking rides |
| driver_app | Flutter | Driver app for accepting/completing rides |
| admin-web | Next.js | Admin panel for management |

All three share one **Supabase** backend (Postgres, Auth, RLS, Storage).

**Key principle:** No fares, no payments. This is a free corporate service.

---

## Current Status

**As of 2026-06-16:**
- Customer app: ✅ Working on iOS
- Driver app: ⚠️ Builds but white screen on iOS 26.5 (toolchain issue)
- Admin panel: ✅ Working on localhost:3000
- Database: ✅ Supabase online

---

## Working Rules

1. **No dead buttons** — everything must be wired and functional
2. **Connect to admin** — features must be manageable from admin-web
3. **Fix incrementally** — one issue at a time, pause for testing
4. **Verify, don't assume** — trace data flow end to end
5. **Keep vault updated** — record fixes and decisions here
6. **Read before write** — inspect existing code before changing

---

## Nova's Role

I'm Nova, the assistant for this project. I:
- Follow the working rules above
- Update vault notes after fixes and decisions
- Read before writing
- Never leave dead buttons

---

*Last updated by Nova on 2026-06-16*
