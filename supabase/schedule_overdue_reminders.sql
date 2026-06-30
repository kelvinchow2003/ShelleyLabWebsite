-- =============================================================================
-- Schedule the overdue-reminders Edge Function to run daily at 9am UTC.
-- =============================================================================
-- Prerequisites:
--   1. Deploy the function:  supabase functions deploy overdue-reminders
--   2. Set its secrets (RESEND_API_KEY, FROM_EMAIL) — see the function header.
--   3. Run this script in the Supabase SQL Editor.
--
-- It uses pg_cron + pg_net (both available on Supabase) to POST to the function.
-- Replace <PROJECT_REF> and <ANON_OR_SERVICE_KEY> below before running.
-- =============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove any previous schedule with the same name (idempotent).
select cron.unschedule('overdue-equipment-reminders')
where exists (
  select 1 from cron.job where jobname = 'overdue-equipment-reminders'
);

select cron.schedule(
  'overdue-equipment-reminders',
  '0 9 * * *', -- every day at 09:00 UTC
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/overdue-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <ANON_OR_SERVICE_KEY>'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- To inspect or remove later:
--   select * from cron.job;
--   select cron.unschedule('overdue-equipment-reminders');
