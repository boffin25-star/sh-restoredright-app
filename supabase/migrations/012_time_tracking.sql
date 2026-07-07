-- Time tracking: crew clock in/out on specific jobs
create table if not exists time_entries (
  id text primary key,
  job_id text not null,
  job_customer text,
  user_name text not null,
  clock_in timestamptz not null,
  clock_out timestamptz,
  duration_minutes numeric,
  notes text,
  created_at timestamptz default now()
);
create index if not exists time_entries_job_id_idx on time_entries(job_id);
create index if not exists time_entries_user_idx on time_entries(user_name);

-- Add estimated and actual hours to job tasks
alter table jobs add column if not exists time_entries jsonb default '[]';
