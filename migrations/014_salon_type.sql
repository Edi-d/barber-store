-- Add salon_type column to salons table
ALTER TABLE salons ADD COLUMN IF NOT EXISTS salon_type TEXT DEFAULT 'barbershop'
  CHECK (salon_type IN ('barbershop', 'coafor'));

-- Index for filtering
CREATE INDEX IF NOT EXISTS idx_salons_type ON salons(salon_type);

-- Ensure existing rows have the default
UPDATE salons SET salon_type = 'barbershop' WHERE salon_type IS NULL;
