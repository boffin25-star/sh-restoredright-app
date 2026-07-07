-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Adds support for task type and pickup/purchase details (contact info, item
-- description, order number, receipt photo) on standalone tasks.

alter table standalone_tasks
  add column if not exists task_type text default 'general';

alter table standalone_tasks
  add column if not exists task_details jsonb default '{}'::jsonb;
