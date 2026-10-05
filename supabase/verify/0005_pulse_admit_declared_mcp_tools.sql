-- Read-only verification for migration 0005_pulse_admit_declared_mcp_tools.sql.
-- Root runs this before and after applying that file. Do not call
-- pulse_apply_delta. Do not delete receipts, reset counters, or edit WAL.
-- Compare the two result sets. Aggregate totals, mcp_tool_calls_observed_from,
-- flush ids, and delta hashes must match until ordinary production flushes arrive.

-- 1. Live validator text. Before 0005 the tool array is the five names from 0003.
--    After 0005 it is exactly:
--    check_ai_readiness, check_agent_readiness, generate_complete_fix_pack,
--    plan_taskmarket_delegation, browse_taskmarket_tasks, track_taskmarket_task
--    and the mcpToolCallsByName counter-map limit is 6 keys, 32 chars.
SELECT pg_get_functiondef('public.pulse_validate_delta(jsonb)'::regprocedure);

-- 2. Aggregate boundary and counters.
SELECT classification_schema_version,
       observation_started_at,
       mcp_tool_calls_observed_from,
       total,
       humans,
       bots,
       ai_crawlers,
       mcp_surface_gets,
       mcp_protocol_requests,
       mcp_protocol_messages,
       mcp_tool_calls_by_name,
       updated_at
FROM public.pulse_aggregate
ORDER BY classification_schema_version;

-- 3. Receipt identities. These rows must be unchanged by the migration itself.
SELECT flush_id, classification_schema_version, delta_hash, applied_at
FROM public.pulse_flush_receipts
ORDER BY applied_at, flush_id;

-- 4. Service-role-only execute. anon and authenticated stay false.
--    service_role stays true for pulse_apply_delta and pulse_read_snapshot.
SELECT has_function_privilege('anon', 'public.pulse_apply_delta(uuid,jsonb)', 'EXECUTE')::text AS anon_apply,
       has_function_privilege('authenticated', 'public.pulse_apply_delta(uuid,jsonb)', 'EXECUTE')::text AS auth_apply,
       has_function_privilege('anon', 'public.pulse_read_snapshot(timestamptz,timestamptz)', 'EXECUTE')::text AS anon_read,
       has_function_privilege('authenticated', 'public.pulse_read_snapshot(timestamptz,timestamptz)', 'EXECUTE')::text AS auth_read,
       has_function_privilege('service_role', 'public.pulse_apply_delta(uuid,jsonb)', 'EXECUTE')::text AS service_apply,
       has_function_privilege('service_role', 'public.pulse_read_snapshot(timestamptz,timestamptz)', 'EXECUTE')::text AS service_read,
       has_function_privilege('anon', 'public.pulse_validate_delta(jsonb)', 'EXECUTE')::text AS anon_validate,
       has_function_privilege('service_role', 'public.pulse_import_legacy_observation(text,jsonb)', 'EXECUTE')::text AS service_legacy;

-- 5. Post-migration predicate. This is false on the deployed 0003 function
--    and true after 0005. It does not write.
SELECT position('check_agent_readiness' in pg_get_functiondef('public.pulse_validate_delta(jsonb)'::regprocedure)) > 0
   AND position('not_a_declared_tool' in pg_get_functiondef('public.pulse_validate_delta(jsonb)'::regprocedure)) = 0
   AS admits_declared_sixth_tool;
