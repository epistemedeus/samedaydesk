-- Supabase-only fallback. Care uses its existing private SQL connection instead.
create or replace function public.record_journey_traffic(observation jsonb) returns void
language sql security invoker set search_path = public, pg_catalog as $$
  insert into public.journey_events as j
    (event_key,brand,event,session_id,test,order_id,is_agent,referrer,utm,traffic)
  values (observation->>'event_key',observation->>'brand',observation->>'event',
    (observation->>'session_id')::uuid,(observation->>'test')::boolean,
    observation->>'order_id',(observation->>'is_agent')::boolean,observation->>'referrer',
    observation->'utm',observation->'traffic')
  on conflict(event_key) do update set traffic = j.traffic || jsonb_build_object(
    'scriptRan',(j.traffic->>'scriptRan')::boolean OR (excluded.traffic->>'scriptRan')::boolean,
    'interacted',(j.traffic->>'interacted')::boolean OR (excluded.traffic->>'interacted')::boolean)
  where j.event='visit' and j.traffic->>'schema'='journey.traffic.v1'
    and excluded.traffic->>'schema'='journey.traffic.v1' and j.test=excluded.test;
$$;
revoke all on function public.record_journey_traffic(jsonb) from public;
grant execute on function public.record_journey_traffic(jsonb) to service_role;
