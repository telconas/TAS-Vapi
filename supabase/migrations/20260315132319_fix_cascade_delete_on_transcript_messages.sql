/*
  # Fix cascade delete on transcript_messages

  ## Problem
  The `transcript_messages` table has a foreign key to `calls` with NO ACTION,
  which causes deleting a call to fail if it has any transcript messages.

  ## Fix
  Drop the existing foreign key and re-add it with ON DELETE CASCADE so that
  transcript messages are automatically removed when their parent call is deleted.
*/

ALTER TABLE transcript_messages
  DROP CONSTRAINT transcript_messages_call_id_fkey;

ALTER TABLE transcript_messages
  ADD CONSTRAINT transcript_messages_call_id_fkey
  FOREIGN KEY (call_id) REFERENCES calls(id) ON DELETE CASCADE;
