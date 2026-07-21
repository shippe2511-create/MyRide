# MyRide Database Export Instructions

## Option 1: Using Supabase CLI (Recommended)

### Install Supabase CLI
```bash
brew install supabase/tap/supabase
```

### Login and link project
```bash
supabase login
supabase link --project-ref lwkndyyfmmrzazdvrsnk
```

### Export schema (DDL - tables, functions, triggers, RLS policies)
```bash
supabase db dump --schema public > myride_schema.sql
```

### Export data only
```bash
supabase db dump --schema public --data-only > myride_data.sql
```

### Export everything (schema + data)
```bash
supabase db dump --schema public > myride_full_backup.sql
```

---

## Option 2: Using pg_dump directly

### Get connection string from Supabase Dashboard
Go to: Project Settings > Database > Connection string (URI)

### Export with pg_dump
```bash
pg_dump "postgresql://postgres:[PASSWORD]@db.lwkndyyfmmrzazdvrsnk.supabase.co:5432/postgres" \
  --schema=public \
  --no-owner \
  --no-privileges \
  > myride_backup.sql
```

---

## Importing to your personal server

### Create a new Supabase project or Postgres database

### Run the SQL file
```bash
psql "your_new_database_connection_string" < myride_full_backup.sql
```

Or in Supabase Dashboard:
1. Go to SQL Editor
2. Paste the SQL content
3. Run

---

## Important Notes

1. **Auth users** are in `auth.users` schema - need separate export:
   ```bash
   supabase db dump --schema auth > auth_backup.sql
   ```

2. **Storage buckets** need manual recreation and file migration

3. **Edge Functions** are in `supabase/functions/` folder - copy those manually

4. **Environment variables** - update in new project:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

5. **RLS policies** are included in schema dump

6. **Realtime** - re-enable publications on new server:
   ```sql
   ALTER PUBLICATION supabase_realtime ADD TABLE your_tables;
   ```
