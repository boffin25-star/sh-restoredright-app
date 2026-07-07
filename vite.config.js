-- Adds vehicle_type to trips so each logged trip can record which vehicle
-- was used. Also adds force_tracking toggle to mileage_settings so admins
-- can enable a prompt reminding crew to start tracking when they begin driving.

alter table trips add column if not exists vehicle_type text;

alter table mileage_settings add column if not exists force_tracking boolean default false;
