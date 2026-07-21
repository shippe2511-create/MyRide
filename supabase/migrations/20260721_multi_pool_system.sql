-- Multi-Pool System Migration
-- Applied: 2026-07-21
-- Replaces fixed public/private text pools with flexible UUID-based pool system

-- Step 1: Create pools table
CREATE TABLE pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  access_type TEXT NOT NULL CHECK (access_type IN ('open', 'restricted')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE pools ENABLE ROW LEVEL SECURITY;

-- Seed initial pools
INSERT INTO pools (id, name, description, access_type) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Public', 'Default open pool for all customers', 'open'),
  ('00000000-0000-0000-0000-000000000002', 'Private', 'Restricted pool for approved customers only', 'restricted');

-- Step 2: Add pool_id columns
ALTER TABLE driver_pools ADD COLUMN pool_id UUID REFERENCES pools(id);
ALTER TABLE customer_pools ADD COLUMN pool_id UUID REFERENCES pools(id);
ALTER TABLE rides ADD COLUMN pool_id UUID REFERENCES pools(id);

-- Step 3: Migrate data
UPDATE driver_pools SET pool_id = '00000000-0000-0000-0000-000000000001' WHERE pool = 'public';
UPDATE driver_pools SET pool_id = '00000000-0000-0000-0000-000000000002' WHERE pool = 'private';
UPDATE customer_pools SET pool_id = '00000000-0000-0000-0000-000000000002' WHERE pool = 'private';
UPDATE rides SET pool_id = '00000000-0000-0000-0000-000000000001' WHERE pool = 'public';
UPDATE rides SET pool_id = '00000000-0000-0000-0000-000000000002' WHERE pool = 'private';

-- Step 4: Finalize schema
ALTER TABLE driver_pools ALTER COLUMN pool_id SET NOT NULL;
ALTER TABLE customer_pools ALTER COLUMN pool_id SET NOT NULL;
ALTER TABLE driver_pools ADD CONSTRAINT driver_pools_driver_pool_unique UNIQUE (driver_id, pool_id);
ALTER TABLE customer_pools ADD CONSTRAINT customer_pools_customer_pool_unique UNIQUE (customer_id, pool_id);
CREATE INDEX idx_driver_pools_pool_id ON driver_pools(pool_id);
CREATE INDEX idx_customer_pools_pool_id ON customer_pools(pool_id);
CREATE INDEX idx_rides_pool_id ON rides(pool_id);
ALTER TABLE driver_pools DROP COLUMN pool;
ALTER TABLE customer_pools DROP COLUMN pool;
ALTER TABLE rides DROP COLUMN pool;

-- Step 5: RLS Policies
DROP POLICY IF EXISTS "Allow all for anon" ON driver_pools;
DROP POLICY IF EXISTS "Allow all for authenticated" ON driver_pools;
DROP POLICY IF EXISTS "Allow all for anon" ON customer_pools;
DROP POLICY IF EXISTS "Allow all for authenticated" ON customer_pools;

CREATE POLICY "pools_admin_all" ON pools FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super-admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super-admin')));
CREATE POLICY "pools_read_active" ON pools FOR SELECT USING (is_active = true);

CREATE POLICY "driver_pools_admin_all" ON driver_pools FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super-admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super-admin')));
CREATE POLICY "driver_pools_driver_read_own" ON driver_pools FOR SELECT
  USING (driver_id IN (SELECT id FROM drivers WHERE profile_id = auth.uid()));

CREATE POLICY "customer_pools_admin_all" ON customer_pools FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super-admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super-admin')));
CREATE POLICY "customer_pools_customer_read_own" ON customer_pools FOR SELECT
  USING (customer_id = auth.uid());

-- Step 6: Updated RPC - get_nearby_drivers_for_customer
CREATE OR REPLACE FUNCTION get_nearby_drivers_for_customer(
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_radius_km DOUBLE PRECISION,
  p_customer_id UUID,
  p_pool_id UUID DEFAULT NULL
)
RETURNS TABLE (
  driver_id UUID,
  profile_id UUID,
  full_name TEXT,
  phone TEXT,
  vehicle_make TEXT,
  vehicle_model TEXT,
  vehicle_color TEXT,
  license_plate TEXT,
  current_lat DOUBLE PRECISION,
  current_lng DOUBLE PRECISION,
  distance_km DOUBLE PRECISION,
  pools UUID[]
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id as driver_id,
    d.profile_id,
    p.full_name,
    p.phone,
    v.make as vehicle_make,
    v.model as vehicle_model,
    v.color as vehicle_color,
    v.vehicle_number as license_plate,
    d.current_location_lat::DOUBLE PRECISION as current_lat,
    d.current_location_lng::DOUBLE PRECISION as current_lng,
    (6371 * acos(
      cos(radians(p_lat)) * cos(radians(d.current_location_lat::DOUBLE PRECISION)) *
      cos(radians(d.current_location_lng::DOUBLE PRECISION) - radians(p_lng)) +
      sin(radians(p_lat)) * sin(radians(d.current_location_lat::DOUBLE PRECISION))
    )) as distance_km,
    array_agg(DISTINCT dp.pool_id) as pools
  FROM drivers d
  JOIN profiles p ON p.id = d.profile_id
  LEFT JOIN vehicles v ON v.id = d.vehicle_id
  JOIN driver_pools dp ON dp.driver_id = d.id
  JOIN pools pl ON pl.id = dp.pool_id AND pl.is_active = true
  WHERE d.is_online = true
    AND d.is_on_break = false
    AND d.current_location_lat IS NOT NULL
    AND d.current_location_lng IS NOT NULL
    AND (p_pool_id IS NULL OR dp.pool_id = p_pool_id)
    AND (
      pl.access_type = 'open'
      OR EXISTS (
        SELECT 1 FROM customer_pools cp
        WHERE cp.customer_id = p_customer_id AND cp.pool_id = dp.pool_id
      )
    )
  GROUP BY d.id, d.profile_id, p.full_name, p.phone, v.make, v.model,
           v.color, v.vehicle_number, d.current_location_lat, d.current_location_lng
  HAVING (6371 * acos(
      cos(radians(p_lat)) * cos(radians(d.current_location_lat::DOUBLE PRECISION)) *
      cos(radians(d.current_location_lng::DOUBLE PRECISION) - radians(p_lng)) +
      sin(radians(p_lat)) * sin(radians(d.current_location_lat::DOUBLE PRECISION))
    )) <= p_radius_km
  ORDER BY distance_km;
END;
$$;

-- Step 7: Updated trigger - validate_ride_pool_access
CREATE OR REPLACE FUNCTION validate_ride_pool_access()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_pool_access_type TEXT;
BEGIN
  IF NEW.pool_id IS NULL THEN
    SELECT id INTO NEW.pool_id FROM pools WHERE name = 'Public' AND is_active = true LIMIT 1;
  END IF;

  SELECT access_type INTO v_pool_access_type
  FROM pools WHERE id = NEW.pool_id AND is_active = true;

  IF v_pool_access_type IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive pool';
  END IF;

  IF v_pool_access_type = 'restricted' THEN
    IF NOT EXISTS (
      SELECT 1 FROM customer_pools
      WHERE customer_id = NEW.customer_id AND pool_id = NEW.pool_id
    ) THEN
      RAISE EXCEPTION 'Customer does not have access to this restricted pool';
    END IF;
  END IF;

  IF NEW.driver_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM driver_pools
      WHERE driver_id = NEW.driver_id AND pool_id = NEW.pool_id
    ) THEN
      RAISE EXCEPTION 'Driver is not a member of the requested pool';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_ride_pool_access_trigger ON rides;
CREATE TRIGGER validate_ride_pool_access_trigger
  BEFORE INSERT OR UPDATE ON rides
  FOR EACH ROW
  EXECUTE FUNCTION validate_ride_pool_access();
