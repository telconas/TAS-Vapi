/*
  # Add notes column to calls table

  1. Changes
    - `calls` table: add `notes` (text, nullable) for operator-entered call notes
    - `calls` table: add `notes_updated_at` (timestamptz, nullable) to track when notes were last edited

  2. Notes
    - No destructive changes; existing rows will have NULL for both new columns
    - No RLS changes needed; existing policies cover new columns automatically
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'calls' AND column_name = 'notes'
  ) THEN
    ALTER TABLE calls ADD COLUMN notes text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'calls' AND column_name = 'notes_updated_at'
  ) THEN
    ALTER TABLE calls ADD COLUMN notes_updated_at timestamptz;
  END IF;
END $$;
