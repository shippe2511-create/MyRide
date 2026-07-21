-- Migration: Departments Foundation (Phase 1)
-- Date: 2026-07-21
-- Description: Adds departments table and RLS helpers for future departmental access control
-- IMPORTANT: This phase adds infrastructure only - NO behavior changes to existing functionality

-- ============================================================================
-- STEP 1: Create departments table
-- ============================================================================
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_departments_name ON departments(name);
CREATE INDEX IF NOT EXISTS idx_departments_is_active ON departments(is_active);

-- ============================================================================
-- STEP 2: Add department_id to profiles (nullable FK)
-- ============================================================================
-- Note: The existing 'department' TEXT column remains for customer employer info
-- The new 'department_id' is for back-office staff organizational structure
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_department_id ON profiles(department_id);

-- ============================================================================
-- STEP 3: Seed default department
-- ============================================================================
INSERT INTO departments (id, name, description)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Operations',
  'Default operations department'
)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- STEP 4: Assign non-super_admin back-office users to Operations
-- super_admins are NOT assigned (they see all departments)
-- ============================================================================
UPDATE profiles
SET department_id = 'a0000000-0000-0000-0000-000000000001'
WHERE role IN ('manager', 'operator')
AND department_id IS NULL;

-- ============================================================================
-- STEP 5: RLS Helper Functions (SECURITY DEFINER)
-- These will be used by future RLS policies for department scoping
-- ============================================================================

-- Get caller's role from their profile
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Get caller's department_id from their profile
CREATE OR REPLACE FUNCTION current_user_department()
RETURNS UUID AS $$
  SELECT department_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Check if caller is super_admin (convenience wrapper)
CREATE OR REPLACE FUNCTION is_current_user_super_admin()
RETURNS BOOLEAN AS $$
  SELECT current_user_role() = 'super_admin';
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ============================================================================
-- STEP 6: RLS Policies on departments table
-- ============================================================================

-- super_admin: full access (CRUD)
CREATE POLICY departments_super_admin_all ON departments
FOR ALL USING (is_current_user_super_admin());

-- Other back-office users: read-only (needed for UI dropdowns)
CREATE POLICY departments_staff_read ON departments
FOR SELECT USING (
  current_user_role() IN ('manager', 'operator')
);

-- ============================================================================
-- VERIFICATION QUERIES (run after migration)
-- ============================================================================
-- SELECT COUNT(*) FROM departments;
-- SELECT * FROM departments;
-- SELECT p.full_name, p.role, p.department_id, d.name
-- FROM profiles p
-- LEFT JOIN departments d ON p.department_id = d.id
-- WHERE p.role IN ('super_admin', 'manager', 'operator');
