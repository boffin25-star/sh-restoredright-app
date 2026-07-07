-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor → New query)

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_name text not null,           -- matches the app's "name" / user identifier (e.g. "Brandon", "Erik")
  endpoint text not null unique,     -- the browser push endpoint URL, unique per device/browser
  p256dh text not null,              -- subscription encryption key
  auth text not null,                -- subscription auth secret
  created_at timestamptz default now()
);

create index if not exists push_subscriptions_user_idx on push_subscriptions (user_name);

alter table push_subscriptions enable row level security;

-- Anon key can insert/select/delete its own subscriptions (app uses the anon key throughout)
create policy "anon can manage push subscriptions" on push_subscriptions
  for all
  using (true)
  with check (true);
