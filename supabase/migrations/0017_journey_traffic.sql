-- Nullable for historical rows. No backfill or reclassification.
alter table public.journey_events add column if not exists traffic jsonb;
create index if not exists journey_events_session_context
  on public.journey_events (session_id,created_at desc)
  where event='visit' and traffic->>'schema'='journey.traffic.v1';
