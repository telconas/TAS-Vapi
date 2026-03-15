/*
  # Add pinned and outcome fields to calls table

  ## Summary
  Adds two new fields to the `calls` table to support:
  1. Pinning/favoriting calls for quick reference
  2. Outcome tracking (resolved/unresolved/pending) for success rate analytics

  ## New Columns
  - `pinned` (boolean, default false) — whether the call is marked as a favorite
  - `outcome` (text, nullable) — call outcome: 'resolved', 'unresolved', or null (not set)

  ## Notes
  - No existing data is affected; defaults are safe
  - No RLS changes needed — existing policies on `calls` cover these new columns
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'calls' AND column_name = 'pinned'
  ) THEN
    ALTER TABLE calls ADD COLUMN pinned boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'calls' AND column_name = 'outcome'
  ) THEN
    ALTER TABLE calls ADD COLUMN outcome text DEFAULT NULL;
  END IF;
END $$;
