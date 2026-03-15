/*
  # Set up pg_cron job to fire scheduled calls every minute

  ## Summary
  Enables the pg_cron and pg_net extensions, then creates a cron job that calls
  the `scheduled-calls-runner` edge function every minute to fire any due calls.

  ## Changes
  - Enables `pg_cron` extension for job scheduling
  - Enables `pg_net` extension for async HTTP requests from the database
  - Creates a cron job `fire-scheduled-calls` that runs every minute
  - The job calls the `scheduled-calls-runner` edge function via HTTP POST
  - Existing cron job is removed first to avoid duplicates on re-run
*/

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.unschedule('fire-scheduled-calls')
FROM cron.job
WHERE jobname = 'fire-scheduled-calls';

SELECT cron.schedule(
  'fire-scheduled-calls',
  '* * * * *',
  $$
  SELECT extensions.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1) || '/functions/v1/scheduled-calls-runner',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_anon_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
