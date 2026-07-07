-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Stores each "On My Way" message sent to a customer — a short-lived public
-- record (looked up by id in the URL) showing which crew members are
-- heading to the job, their photo, and vehicle info. No login required to
-- view, since the customer receiving the text/email isn't a user of the app.

create table if not exists on_my_way (
  id text primary key,
  job_id text,
  job_customer text,
  crew_names text not null,      -- comma-separated list of employee names included
  eta_note text,                 -- optional free-text ETA like "within the hour"
  created_by text,
  created_at timestamptz default now()
);

create index if not exists on_my_way_job_idx on on_my_way (job_id);

alter table on_my_way enable row level security;

create policy "anon can manage on my way records" on on_my_way
  for all
  using (true)
  with check (true);
