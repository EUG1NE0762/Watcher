-- Daily ingestion + score recompute with pg_cron and pg_net.
-- Not a migration because it needs your project URL and a secret. `npm run deploy:backend` runs it
-- for you; to run it by hand in the SQL editor, first store both values in Vault:
--   select vault.create_secret('https://<project-ref>.supabase.co', 'watcher_project_url');
--   select vault.create_secret('<your CRON_SECRET>', 'watcher_cron_secret');
-- (same CRON_SECRET as the function secret). Safe to run again: it replaces the two jobs.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobname) from cron.job where jobname in ('watcher-ingest', 'watcher-recompute');

-- 03:00 UTC (05:00 Lusaka): pull feeds, extract, verify, dedupe, recompute affected areas.
select cron.schedule(
  'watcher-ingest',
  '0 3 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'watcher_project_url') || '/functions/v1/ingest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-watcher-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'watcher_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);

-- 03:30 UTC: recompute every area so recency decay applies even without new incidents.
select cron.schedule(
  'watcher-recompute',
  '30 3 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'watcher_project_url') || '/functions/v1/recompute-scores',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-watcher-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'watcher_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
