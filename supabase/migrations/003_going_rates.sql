-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Creates the going_rates table used by the "Rates" tab, including the
-- Xactimate price-list import feature (Admin → Rates → Import).

create table if not exists going_rates (
  id text primary key,
  category text not null,
  work_type text not null,
  rate_low text not null,
  rate_high text,
  unit text,
  source text,
  notes text,
  created_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists going_rates_category_idx on going_rates (category);

alter table going_rates enable row level security;

create policy "anon can manage going rates" on going_rates
  for all
  using (true)
  with check (true);
