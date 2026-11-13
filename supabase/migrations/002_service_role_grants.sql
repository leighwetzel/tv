-- Lets the server function (service role) save title details and streaming info.
-- Needed because new tables aren't exposed automatically on this project.
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;
