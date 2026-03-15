/*
  # Enable Supabase Realtime on the calls table

  ## Summary
  Adds the `calls` table to Supabase's realtime publication so that INSERT and UPDATE
  events are streamed to connected clients. This allows the dashboard to detect when a
  scheduled call starts and automatically populate a call slot for live monitoring.

  ## Changes
  - Adds `calls` table to `supabase_realtime` publication
*/

ALTER PUBLICATION supabase_realtime ADD TABLE calls;
