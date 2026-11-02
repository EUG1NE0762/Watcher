-- Triggers and RPCs.

-- Create a profile row for every new auth user (including anonymous sign-ins).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger incidents_touch before update on public.incidents
  for each row execute function public.touch_updated_at();

-- Area containing a point (or the nearest within ~2.5 km). Used by ingestion's geocoding fallback.
create or replace function public.area_at_point(p_lat double precision, p_lng double precision)
returns text
language sql
stable
set search_path = ''
as $$
  select a.id
  from public.areas a
  order by
    extensions.st_contains(a.geom, extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)) desc,
    extensions.st_distance(a.centroid::extensions.geography, extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography)
  limit 1
$$;

create or replace function public.is_moderator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.is_moderator from public.profiles p where p.id = auth.uid()), false)
$$;

-- "Delete account and data": removes the auth user; every user-owned table cascades.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.area_at_point(double precision, double precision) to anon, authenticated;
grant execute on function public.is_moderator() to authenticated;

-- Storage bucket for cached ElevenLabs briefings (only when the storage schema exists, i.e. on Supabase).
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public)
    values ('briefings', 'briefings', true)
    on conflict (id) do nothing;
  end if;
end;
$$;

-- Community reports for an area, shown separately as "unverified" / "moderator approved".
-- Exposes only the content: no user id and no coordinates. Rejected reports are never returned.
create or replace function public.area_community_reports(p_area_id text)
returns table (id uuid, type text, note text, created_at timestamptz, status text, corroborated boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.type, r.note, r.created_at, r.status, r.corroborated_by_incident_id is not null
  from public.community_reports r
  where r.area_id = p_area_id
    and r.status in ('pending', 'approved')
    and r.created_at > now() - interval '60 days'
  order by r.created_at desc
  limit 30
$$;

grant execute on function public.area_community_reports(text) to anon, authenticated;
