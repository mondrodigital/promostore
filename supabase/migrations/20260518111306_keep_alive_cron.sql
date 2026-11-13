-- Weekly keep-alive cron job to prevent Supabase from pausing the project
-- due to inactivity (free tier pauses after 2 weeks with no database activity).
-- pg_cron is pre-installed on this project (v1.6).
-- Runs every Sunday at 00:00 UTC — a lightweight query against pg_stat_activity.
select cron.schedule(
  'weekly-keep-alive',
  '0 0 * * 0',
  $$ select count(*) from pg_stat_activity $$
);
