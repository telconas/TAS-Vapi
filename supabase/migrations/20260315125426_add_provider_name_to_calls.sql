/*
  # Add provider_name to calls table

  1. Changes
    - `calls` table: add `provider_name` (text, nullable) column to store the carrier/provider
      name selected at call time (e.g., "ATT", "Comcast West", "Spectrum Business").

  2. Notes
    - No destructive changes; existing rows will have NULL for provider_name.
    - No RLS changes needed; existing policies cover the new column automatically.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'calls' AND column_name = 'provider_name'
  ) THEN
    ALTER TABLE calls ADD COLUMN provider_name text;
  END IF;
END $$;
