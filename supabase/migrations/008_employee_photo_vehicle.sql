-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Adds a profile photo and vehicle description/photo to each employee, used
-- by the "On My Way" email/text generator so customers can see who's coming
-- and what they'll be driving.

alter table employees add column if not exists photo_url text;
alter table employees add column if not exists vehicle_description text;
alter table employees add column if not exists vehicle_photo_url text;
