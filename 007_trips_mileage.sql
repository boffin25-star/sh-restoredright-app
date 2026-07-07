-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Creates the material_prices table for the Material Price Finder tab —
-- lets crews search what local suppliers charge for common materials and
-- see who currently has the best price.

create table if not exists material_prices (
  id text primary key,
  item_name text not null,
  category text default 'Uncategorized',
  supplier text not null,
  sku text,
  unit text default 'Each',
  price numeric(12,2) not null default 0,
  city text,
  zip text,
  photo_url text,          -- optional photo of a price tag/shelf label as proof
  notes text,
  submitted_by text,
  updated_at date default current_date,
  created_at timestamptz default now()
);

create index if not exists material_prices_item_name_idx on material_prices using gin (to_tsvector('english', item_name));
create index if not exists material_prices_supplier_idx on material_prices (supplier);
create index if not exists material_prices_category_idx on material_prices (category);

alter table material_prices enable row level security;

create policy "anon can manage material prices" on material_prices
  for all
  using (true)
  with check (true);
