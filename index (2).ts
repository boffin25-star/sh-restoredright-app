-- Extended employee profile fields
alter table employees add column if not exists address text;
alter table employees add column if not exists vehicle_type text;
alter table employees add column if not exists fuel_type text default 'gas';
alter table employees add column if not exists emergency_contact_name text;
alter table employees add column if not exists emergency_contact_phone text;
alter table employees add column if not exists emergency_contact_relation text;

-- Contacts table: add employee_id so we can upsert without duplicates
alter table contacts add column if not exists employee_id text;
create index if not exists contacts_employee_id_idx on contacts(employee_id);
