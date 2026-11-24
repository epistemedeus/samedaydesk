-- Additive coarse evidence only. Historical rows remain null.
alter table public.journey_events add column if not exists traffic jsonb;
