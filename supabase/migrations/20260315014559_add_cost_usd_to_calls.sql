/*
  # Add cost_usd column to calls table

  ## Summary
  Adds a `cost_usd` column to the `calls` table to store the calculated cost of each call
  based on a $35/hour rate ($0.00972/second).

  ## Changes
  - `calls` table: new `cost_usd` (numeric, nullable) column — populated after call ends

  ## Notes
  - Cost formula: duration_seconds / 3600 * 35
  - Column is nullable; null means cost has not been calculated yet (call in progress or legacy)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'calls' AND column_name = 'cost_usd'
  ) THEN
    ALTER TABLE calls ADD COLUMN cost_usd numeric(10, 4) DEFAULT NULL;
  END IF;
END $$;
