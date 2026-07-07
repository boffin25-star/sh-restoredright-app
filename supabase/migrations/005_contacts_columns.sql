-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Fixes "Could not find the 'cellPhone' column of 'contacts'" and similar
-- errors. The app sends contact fields as camelCase JSON keys (cellPhone,
-- homePhone) which PostgREST maps directly to column names — if the table
-- was originally created with snake_case columns instead, those calls fail.
-- This adds the camelCase columns the app actually uses, quoted so Postgres
-- preserves the exact casing. Safe to run even if some already exist.

alter table contacts add column if not exists "cellPhone" text;
alter table contacts add column if not exists "homePhone" text;
