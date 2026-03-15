/*
  # Schedule cron job using pg_net to fire scheduled calls every minute

  ## Summary
  Creates a pg_cron job that fires every minute and uses pg_net to HTTP POST
  to the scheduled-calls-runner edge function. Uses the project's URL and anon
  key directly so no vault lookup is needed.

  ## Changes
  - Removes old cron job if it exists
  - Creates a new `fire-scheduled-calls` cron job running every minute
  - Uses net.http_post (pg_net) for the HTTP call
*/

SELECT cron.schedule(
  'fire-scheduled-calls',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://hpnfzuianvgsyjjikrtv.supabase.co/functions/v1/scheduled-calls-runner',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwbmZ6dWlhbnZnc3lqamlrcnR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0OTQyNDksImV4cCI6MjA4OTA3MDI0OX0.jXlLd7pFgzrDmJe9yjaBdgT1fldO-rWjcXzFyiuM55o"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
