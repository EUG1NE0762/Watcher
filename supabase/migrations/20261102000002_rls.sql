-- Row Level Security. The service role (Edge Functions) bypasses RLS and is the only writer of
-- incidents, scores, sources and areas. Users only ever touch their own rows.
alter table public.sources enable row level security;
alter table public.areas enable row level security;
alter table public.incidents enable row level security;
alter table public.incident_sources enable row level security;
alter table public.official_stats enable row level security;
alter table public.risk_scores enable row level security;
alter table public.profiles enable row level security;
alter table public.community_reports enable row level security;
alter table public.saved_places enable row level security;
alter table public.trips_checked enable row level security;
alter table public.ingestion_runs enable row level security;

-- Public reference data
create policy "sources readable" on public.sources for select to anon, authenticated using (enabled);
create policy "areas readable" on public.areas for select to anon, authenticated using (true);
create policy "scores readable" on public.risk_scores for select to anon, authenticated using (true);
create policy "stats readable" on public.official_stats for select to anon, authenticated using (true);

-- Only verified incidents are visible; pending/rejected stay internal.
create policy "verified incidents readable" on public.incidents
  for select to anon, authenticated using (status = 'verified');
create policy "corroborations of verified incidents readable" on public.incident_sources
  for select to anon, authenticated
  using (exists (select 1 from public.incidents i where i.id = incident_id and i.status = 'verified'));

-- Profiles: own row only, and the moderator flag cannot be self-assigned.
create policy "own profile read" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "own profile insert" on public.profiles for insert to authenticated
  with check (id = (select auth.uid()) and is_moderator = false);
create policy "own profile update" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke update on public.profiles from authenticated, anon;
grant update (role, language, home_city, push_token, notify_rating_changes, notify_incidents) on public.profiles to authenticated;

-- Community reports: users read and delete their own. Inserts go through the submit-report
-- Edge Function so rate limiting and the abuse filter cannot be bypassed.
create policy "own reports read" on public.community_reports for select to authenticated using (user_id = (select auth.uid()));
create policy "own reports delete" on public.community_reports for delete to authenticated using (user_id = (select auth.uid()));

-- Saved places and history: fully private to the owner.
create policy "own saved places" on public.saved_places for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own history" on public.trips_checked for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ingestion_runs: no policies => no client access.

grant usage on schema public to anon, authenticated;
grant select on public.sources, public.areas, public.risk_scores, public.official_stats, public.incidents, public.incident_sources to anon, authenticated;
grant select on public.areas_public to anon, authenticated;
grant select, insert on public.profiles to authenticated;
grant select, delete on public.community_reports to authenticated;
grant select, insert, update, delete on public.saved_places, public.trips_checked to authenticated;
