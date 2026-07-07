-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Creates the trips table for the Mileage tab — tracks drive time, distance,
-- and estimated fuel cost per trip, optionally linked to a job.

create table if not exists trips (
  id text primary key,
  user_name text not null,
  job_id text,                    -- optional link to a job; null = general/admin trip
  job_customer text,              -- denormalized for display without a join
  method text not null default 'manual',   -- 'gps' | 'manual_odometer' | 'manual_address'
  start_label text,               -- address or "Odometer start" description
  end_label text,
  start_odometer numeric,
  end_odometer numeric,
  start_lat numeric,
  start_lng numeric,
  end_lat numeric,
  end_lng numeric,
  miles numeric not null default 0,
  started_at timestamptz,
  ended_at timestamptz,
  duration_minutes numeric,
  rate_type text default 'default',  -- 'default' | 'per_mile' | 'fuel_mpg'
  rate_per_mile numeric,             -- used when rate_type = 'per_mile' or resolved default
  fuel_price numeric,                -- used when rate_type = 'fuel_mpg'
  mpg numeric,                       -- used when rate_type = 'fuel_mpg'
  estimated_cost numeric,
  purpose text,
  notes text,
  created_at timestamptz default now()
);

create index if not exists trips_user_idx on trips (user_name);
create index if not exists trips_job_idx on trips (job_id);
create index if not exists trips_started_idx on trips (started_at);

alter table trips enable row level security;

create policy "anon can manage trips" on trips
  for all
  using (true)
  with check (true);

-- Company-wide mileage settings (default rate, fuel price, MPG) — a single
-- row table, same pattern as a settings/config table since there's only
-- ever one set of defaults for the whole company.
create table if not exists mileage_settings (
  id text primary key default 'default',
  rate_per_mile numeric default 0.67,   -- IRS standard mileage rate as a sane starting default
  fuel_price numeric default 3.75,
  mpg numeric default 18,
  updated_by text,
  updated_at timestamptz default now()
);

alter table mileage_settings enable row level security;

create policy "anon can manage mileage settings" on mileage_settings
  for all
  using (true)
  with check (true);
