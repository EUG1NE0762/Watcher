-- Watcher core schema. Areas, not people: nothing here stores or profiles individuals.
create schema if not exists extensions;
create extension if not exists postgis with schema extensions;

-- ---------------------------------------------------------------- reference data
create table public.sources (
  id text primary key,
  name text not null,
  type text not null check (type in ('official', 'media', 'demo')),
  base_url text not null check (base_url ~ '^https?://'),
  credibility_weight numeric(3, 2) not null check (credibility_weight between 0 and 1),
  requires_corroboration boolean not null default false,
  feeds text[] not null default '{}',
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.areas (
  id text primary key,
  name text not null,
  city text not null,
  province text not null,
  area_type text not null default 'mixed' check (area_type in ('residential', 'commercial', 'transport', 'mixed')),
  aliases text[] not null default '{}',
  description text not null default '',
  geom extensions.geometry(Polygon, 4326) not null,
  centroid extensions.geometry(Point, 4326) not null,
  created_at timestamptz not null default now()
);
create index areas_geom_idx on public.areas using gist (geom);
create index areas_city_idx on public.areas (city);

-- ---------------------------------------------------------------- incidents
create table public.incidents (
  id text primary key default gen_random_uuid()::text,
  area_id text references public.areas (id) on delete set null,
  category text not null check (category in ('theft', 'robbery', 'assault', 'burglary', 'vehicle_crime', 'sexual_offence', 'drug_offence', 'other')),
  severity smallint not null check (severity between 1 and 5),
  substance text check (substance in ('cannabis', 'alcohol', 'methaqualone', 'heroin', 'cocaine', 'synthetic', 'other')),
  occurred_at timestamptz not null,
  published_at timestamptz not null,
  source_id text not null references public.sources (id),
  source_url text not null check (source_url ~ '^https?://'),
  summary text not null check (char_length(summary) between 10 and 400),
  location_text text,
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  status text not null default 'pending' check (status in ('verified', 'pending', 'rejected')),
  is_demo boolean not null default false,
  raw_text_hash text not null unique,
  corroboration_count smallint not null default 1,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A verified incident must be tied to an area; unmapped items stay pending.
  constraint verified_has_area check (status <> 'verified' or area_id is not null)
);
create index incidents_area_status_idx on public.incidents (area_id, status, occurred_at desc);
create index incidents_status_idx on public.incidents (status, created_at desc);

-- Independent sources that corroborate an incident (the primary source is on incidents itself).
create table public.incident_sources (
  incident_id text not null references public.incidents (id) on delete cascade,
  source_id text not null references public.sources (id),
  source_url text not null check (source_url ~ '^https?://'),
  published_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (incident_id, source_url)
);

create table public.official_stats (
  id uuid primary key default gen_random_uuid(),
  area_id text references public.areas (id) on delete cascade,
  city text not null,
  category text not null,
  period_start date not null,
  period_end date not null,
  count integer not null check (count >= 0),
  source_id text not null references public.sources (id),
  source_url text not null check (source_url ~ '^https?://'),
  published_at timestamptz not null,
  notes text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- scores
create table public.risk_scores (
  area_id text not null references public.areas (id) on delete cascade,
  time_band text not null check (time_band in ('morning', 'afternoon', 'evening', 'night')),
  score smallint check (score between 0 and 100),
  rating text not null check (rating in ('low', 'moderate', 'high', 'insufficient_data')),
  breakdown jsonb not null default '{}',
  computed_at timestamptz not null default now(),
  primary key (area_id, time_band)
);

-- ---------------------------------------------------------------- users
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'visitor' check (role in ('visitor', 'driver', 'resident')),
  language text not null default 'en' check (language in ('en', 'ny', 'bem')),
  home_city text,
  is_moderator boolean not null default false,
  push_token text,
  notify_rating_changes boolean not null default true,
  notify_incidents boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.community_reports (
  id uuid primary key default gen_random_uuid(),
  area_id text not null references public.areas (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('theft', 'robbery', 'assault', 'harassment', 'suspicious_activity', 'safe_spot', 'other')),
  note text not null check (char_length(note) between 5 and 280),
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  created_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  corroborated_by_incident_id text references public.incidents (id) on delete set null,
  moderator_note text
);
create index community_reports_user_idx on public.community_reports (user_id, created_at desc);
create index community_reports_area_idx on public.community_reports (area_id, status);

create table public.saved_places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  area_id text not null references public.areas (id) on delete cascade,
  label text check (char_length(label) <= 60),
  last_rating text,
  created_at timestamptz not null default now(),
  unique (user_id, area_id)
);

create table public.trips_checked (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('area', 'trip')),
  area_id text references public.areas (id) on delete cascade,
  pickup_area_id text references public.areas (id) on delete cascade,
  dropoff_area_id text references public.areas (id) on delete cascade,
  time_band text check (time_band in ('morning', 'afternoon', 'evening', 'night')),
  rating text,
  checked_at timestamptz not null default now()
);
create index trips_checked_user_idx on public.trips_checked (user_id, checked_at desc);

-- ---------------------------------------------------------------- operations
create table public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  stats jsonb not null default '{}'
);

-- Public read model for the app: polygon as GeoJSON, centroid as lat/lng.
create view public.areas_public with (security_invoker = true) as
select
  a.id,
  a.name,
  a.city,
  a.province,
  a.area_type,
  a.aliases,
  a.description,
  extensions.st_y(a.centroid) as lat,
  extensions.st_x(a.centroid) as lng,
  (extensions.st_asgeojson(a.geom)::jsonb -> 'coordinates' -> 0) as polygon
from public.areas a;
