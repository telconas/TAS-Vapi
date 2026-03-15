/*
  # Add DELETE policy to calls table

  ## Summary
  The calls table was missing a DELETE policy, which caused delete operations
  to be silently rejected by RLS while the UI updated optimistically (making
  deletes appear to work but reappear on refresh).

  ## Changes
  - Adds a DELETE policy for authenticated users
  - Adds a DELETE policy for anon users (matching existing insert/update patterns)
*/

CREATE POLICY "Authenticated users can delete calls"
  ON calls FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "Anon users can delete calls"
  ON calls FOR DELETE
  TO anon
  USING (true);
