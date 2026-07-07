-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Adds a "preferred supplier" flag and a lat/lng cache (so addresses only
-- need to be geocoded once, not on every app load) to support sorting
-- suppliers by preferred-first, then nearest-to-the-user.

alter table contacts add column if not exists preferred boolean default false;
alter table contacts add column if not exists lat numeric;
alter table contacts add column if not exists lng numeric;
