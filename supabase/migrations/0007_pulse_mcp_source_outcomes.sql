-- Optional bounded server-observed MCP source/outcomes in the existing Pulse aggregate.
-- No backfill: NULL means unknown historical source/outcomes. Existing counters,
-- WAL schema version and receipt hashes for deltas lacking this field stay unchanged.
-- Apply before deploying the producer. Old DBs reject new deltas; the existing WAL
-- retains them with backoff. Do not strip the dimension to make a flush succeed.
alter table public.pulse_aggregate add column if not exists mcp_outcomes jsonb;

create or replace function public.pulse_validate_mcp_outcomes(p_value jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  v_key text; v_parts text[]; v_time timestamptz; v_counts jsonb;
  v_sources text[] := array['unattributed','agentverse-a2a-v1'];
  v_tools text[] := array['_none','_unknown','check_ai_readiness','generate_complete_fix_pack','plan_taskmarket_delegation','browse_taskmarket_tasks','track_taskmarket_task','check_agent_readiness','project_funnel_evidence'];
  v_events text[] := array['http_request','tool_attempt','normal_result','tool_refusal','protocol_error','notification_completed','response_finished','disconnected'];
begin
  if jsonb_typeof(p_value) is distinct from 'object'
    or (select count(*) from jsonb_object_keys(p_value)) <> 2
    or not (p_value ? 'observedFrom' and p_value ? 'counts') then
    raise exception 'pulse_invalid_field:mcpOutcomes' using errcode='22023';
  end if;
  if jsonb_typeof(p_value->'observedFrom') is distinct from 'string'
    or (p_value->>'observedFrom') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$' then
    raise exception 'pulse_invalid_field:mcpOutcomes' using errcode='22023';
  end if;
  begin
    v_time := (p_value->>'observedFrom')::timestamptz;
  exception when others then
    raise exception 'pulse_invalid_field:mcpOutcomes' using errcode='22023';
  end;
  if not isfinite(v_time) or to_char(v_time at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') <> (p_value->>'observedFrom')
    or jsonb_typeof(p_value->'counts') is distinct from 'object' then
    raise exception 'pulse_invalid_field:mcpOutcomes' using errcode='22023';
  end if;
  -- Reject arbitrary labels before a shared validator could include a raw key
  -- in its diagnostic field path. Only fixed keys reach that validator.
  for v_key in select jsonb_object_keys(p_value->'counts') loop
    v_parts := string_to_array(v_key,'|');
    if cardinality(v_parts) <> 3 or not (v_parts[1]=any(v_sources))
      or not (v_parts[2]=any(v_tools)) or not (v_parts[3]=any(v_events)) then
      raise exception 'pulse_invalid_field:mcpOutcomes' using errcode='22023';
    end if;
  end loop;
  v_counts := public.pulse_validate_counter_map(p_value->'counts','mcpOutcomes',null,144,96);
  for v_key in select jsonb_object_keys(v_counts) loop
    if (v_counts->>v_key)::numeric > 9007199254740991 then
      raise exception 'pulse_invalid_field:mcpOutcomes' using errcode='22023';
    end if;
  end loop;
  return jsonb_build_object('observedFrom',to_char(v_time at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'counts',v_counts);
end; $$;

create or replace function public.pulse_merge_mcp_outcomes(p_base jsonb,p_add jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select case when p_base is null then p_add when p_add is null then p_base else
    jsonb_build_object('observedFrom',least(p_base->>'observedFrom',p_add->>'observedFrom'),
      'counts',public.pulse_merge_counter_maps(p_base->'counts',p_add->'counts')) end;
$$;

create or replace function public.pulse_validate_delta(p_delta jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  v_schema int;
  v_tool_observed_from timestamptz;
  v_funnel_keys text[] := array['home', 'scan', 'tools', 'reports', 'guides', 'pricing'];
  v_mcp_keys text[] := array['initialize', 'tools/list', 'tools/call', 'notifications', 'other'];
  v_tool_keys text[] := array['check_ai_readiness', 'check_agent_readiness', 'generate_complete_fix_pack', 'plan_taskmarket_delegation', 'browse_taskmarket_tasks', 'track_taskmarket_task', 'project_funnel_evidence'];
begin
  if p_delta is null or jsonb_typeof(p_delta) <> 'object' then raise exception 'pulse_invalid_delta' using errcode = '22023'; end if;
  if (select count(*) from jsonb_object_keys(p_delta) k where k not in (
    'schemaVersion','total','humans','bots','aiCrawlers','mcpSurfaceGets',
    'mcpProtocolRequests','mcpProtocolMessages','mcpProtocolByMethod','mcpToolCallsObservedFrom','mcpToolCallsByName',
    'byPath','byReferer','byAiBot','funnel','sellerRepair','mcpOutcomes')) > 0 then
    raise exception 'pulse_invalid_delta' using errcode = '22023';
  end if;
  v_schema := public.pulse_validate_nonneg_int(p_delta -> 'schemaVersion', 'schemaVersion')::int;
  if v_schema <> 2 then raise exception 'pulse_invalid_schema_version' using errcode = '22023'; end if;
  if jsonb_typeof(p_delta -> 'mcpToolCallsObservedFrom') <> 'string'
     or (p_delta ->> 'mcpToolCallsObservedFrom') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$' then
    raise exception 'pulse_invalid_field:mcpToolCallsObservedFrom' using errcode = '22023';
  end if;
  begin
    v_tool_observed_from := (p_delta ->> 'mcpToolCallsObservedFrom')::timestamptz;
  exception when others then
    raise exception 'pulse_invalid_field:mcpToolCallsObservedFrom' using errcode = '22023';
  end;
  if not isfinite(v_tool_observed_from) then
    raise exception 'pulse_invalid_field:mcpToolCallsObservedFrom' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'schemaVersion',v_schema,
    'total',public.pulse_validate_nonneg_int(p_delta -> 'total','total'),
    'humans',public.pulse_validate_nonneg_int(p_delta -> 'humans','humans'),
    'bots',public.pulse_validate_nonneg_int(p_delta -> 'bots','bots'),
    'aiCrawlers',public.pulse_validate_nonneg_int(p_delta -> 'aiCrawlers','aiCrawlers'),
    'mcpSurfaceGets',public.pulse_validate_nonneg_int(p_delta -> 'mcpSurfaceGets','mcpSurfaceGets'),
    'mcpProtocolRequests',public.pulse_validate_nonneg_int(p_delta -> 'mcpProtocolRequests','mcpProtocolRequests'),
    'mcpProtocolMessages',public.pulse_validate_nonneg_int(p_delta -> 'mcpProtocolMessages','mcpProtocolMessages'),
    'mcpProtocolByMethod',public.pulse_validate_counter_map(p_delta -> 'mcpProtocolByMethod','mcpProtocolByMethod',v_mcp_keys,8,32),
    'mcpToolCallsObservedFrom',v_tool_observed_from,
    'mcpToolCallsByName',public.pulse_validate_counter_map(p_delta -> 'mcpToolCallsByName','mcpToolCallsByName',v_tool_keys,7,32),
    'byPath',public.pulse_validate_counter_map(p_delta -> 'byPath','byPath',null,200,60),
    'byReferer',public.pulse_validate_counter_map(p_delta -> 'byReferer','byReferer',null,200,96),
    'byAiBot',public.pulse_validate_counter_map(p_delta -> 'byAiBot','byAiBot',null,64,64),
    'funnel',public.pulse_validate_counter_map(p_delta -> 'funnel','funnel',v_funnel_keys,8,16),
    'sellerRepair',public.pulse_validate_seller_repair(p_delta -> 'sellerRepair'))
    || case when p_delta ? 'mcpOutcomes' then jsonb_build_object('mcpOutcomes',public.pulse_validate_mcp_outcomes(p_delta->'mcpOutcomes')) else '{}'::jsonb end;
end; $$;

create or replace function public.pulse_apply_delta(p_flush_id uuid, p_delta jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_delta jsonb; v_hash text; v_schema int; v_existing record;
begin
  if p_flush_id is null then raise exception 'pulse_invalid_flush_id' using errcode = '22023'; end if;
  v_delta := public.pulse_validate_delta(p_delta); v_hash := public.pulse_delta_hash(v_delta); v_schema := (v_delta ->> 'schemaVersion')::int;
  select flush_id,delta_hash into v_existing from public.pulse_flush_receipts where flush_id=p_flush_id;
  if found then
    if v_existing.delta_hash <> v_hash then raise exception 'pulse_flush_id_conflict' using errcode = '22023'; end if;
    return jsonb_build_object('status','already_applied','flushId',p_flush_id);
  end if;
  insert into public.pulse_aggregate as a (
    classification_schema_version,observation_started_at,total,humans,bots,ai_crawlers,mcp_surface_gets,
    mcp_protocol_requests,mcp_protocol_messages,mcp_protocol_by_method,mcp_tool_calls_observed_from,mcp_tool_calls_by_name,
    by_path,by_referer,by_ai_bot,funnel,seller_repair,mcp_outcomes)
  values (v_schema,now(),(v_delta->>'total')::bigint,(v_delta->>'humans')::bigint,(v_delta->>'bots')::bigint,
    (v_delta->>'aiCrawlers')::bigint,(v_delta->>'mcpSurfaceGets')::bigint,(v_delta->>'mcpProtocolRequests')::bigint,
    (v_delta->>'mcpProtocolMessages')::bigint,v_delta->'mcpProtocolByMethod',(v_delta->>'mcpToolCallsObservedFrom')::timestamptz,v_delta->'mcpToolCallsByName',
    v_delta->'byPath',v_delta->'byReferer',v_delta->'byAiBot',v_delta->'funnel',v_delta->'sellerRepair',v_delta->'mcpOutcomes')
  on conflict (classification_schema_version) do update set
    observation_started_at=coalesce(a.observation_started_at,excluded.observation_started_at),total=a.total+excluded.total,
    humans=a.humans+excluded.humans,bots=a.bots+excluded.bots,ai_crawlers=a.ai_crawlers+excluded.ai_crawlers,
    mcp_surface_gets=a.mcp_surface_gets+excluded.mcp_surface_gets,mcp_protocol_requests=a.mcp_protocol_requests+excluded.mcp_protocol_requests,
    mcp_protocol_messages=a.mcp_protocol_messages+excluded.mcp_protocol_messages,
    mcp_protocol_by_method=public.pulse_merge_counter_maps(a.mcp_protocol_by_method,excluded.mcp_protocol_by_method),
    mcp_tool_calls_observed_from=least(a.mcp_tool_calls_observed_from,excluded.mcp_tool_calls_observed_from),
    mcp_tool_calls_by_name=public.pulse_merge_counter_maps(a.mcp_tool_calls_by_name,excluded.mcp_tool_calls_by_name),
    by_path=public.pulse_merge_counter_maps(a.by_path,excluded.by_path),by_referer=public.pulse_merge_counter_maps(a.by_referer,excluded.by_referer),
    by_ai_bot=public.pulse_merge_counter_maps(a.by_ai_bot,excluded.by_ai_bot),funnel=public.pulse_merge_counter_maps(a.funnel,excluded.funnel),
    mcp_outcomes=public.pulse_merge_mcp_outcomes(a.mcp_outcomes,excluded.mcp_outcomes),
    seller_repair=public.pulse_merge_seller_repair(a.seller_repair,excluded.seller_repair),updated_at=now();
  insert into public.pulse_flush_receipts(flush_id,classification_schema_version,delta_hash) values(p_flush_id,v_schema,v_hash);
  return jsonb_build_object('status','applied','flushId',p_flush_id);
end; $$;

create or replace function public.pulse_read_snapshot(p_observation_start timestamptz,p_observation_end timestamptz default now())
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row record; v_out jsonb; v_legacy record;
begin
  if p_observation_start is null then raise exception 'pulse_invalid_observation_start' using errcode='22023'; end if;
  if p_observation_end is null or p_observation_end < p_observation_start then raise exception 'pulse_invalid_observation_end' using errcode='22023'; end if;
  select * into v_row from public.pulse_aggregate where classification_schema_version=2;
  v_out := jsonb_build_object('schemaVersion',2,'observationStart',coalesce(v_row.observation_started_at,p_observation_start),'observationEnd',p_observation_end,
    'total',coalesce(v_row.total,0),'humans',coalesce(v_row.humans,0),'bots',coalesce(v_row.bots,0),'aiCrawlers',coalesce(v_row.ai_crawlers,0),
    'mcpOutcomes',v_row.mcp_outcomes,
    'mcpSurfaceGets',coalesce(v_row.mcp_surface_gets,0),'mcpProtocolRequests',coalesce(v_row.mcp_protocol_requests,0),
    'mcpProtocolMessages',coalesce(v_row.mcp_protocol_messages,0),'mcpProtocolByMethod',coalesce(v_row.mcp_protocol_by_method,'{}'::jsonb),
    'mcpToolCallsObservedFrom',v_row.mcp_tool_calls_observed_from,
    'mcpToolCallsByName',coalesce(v_row.mcp_tool_calls_by_name,'{}'::jsonb),'byPath',coalesce(v_row.by_path,'{}'::jsonb),
    'byReferer',coalesce(v_row.by_referer,'{}'::jsonb),'byAiBot',coalesce(v_row.by_ai_bot,'{}'::jsonb),'funnel',coalesce(v_row.funnel,'{}'::jsonb),
    'sellerRepair',coalesce(v_row.seller_repair,jsonb_build_object('briefViews',0,'scopeClicks',0,'checkoutStarts',0,'byFinding','{}'::jsonb)));
  select * into v_legacy from public.pulse_legacy_observations where import_key='pr9_v1_migration' limit 1;
  if found then v_out := v_out || jsonb_build_object('legacyUncertainty',jsonb_build_object(
    'schemaVersion',v_legacy.schema_version,'note',v_legacy.note,'startedAt',v_legacy.started_at,'total',v_legacy.total,
    'humans',v_legacy.humans,'uniqueHumans',v_legacy.unique_humans,'bots',v_legacy.bots,'aiCrawlers',v_legacy.ai_crawlers,
    'byPath',v_legacy.by_path,'byReferer',v_legacy.by_referer,'byAiBot',v_legacy.by_ai_bot,'funnel',v_legacy.funnel,
    'authority','incomplete_historical_evidence')); end if;
  return v_out;
end; $$;

revoke all on function public.pulse_apply_delta(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.pulse_read_snapshot(timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.pulse_apply_delta(uuid,jsonb) to service_role;
grant execute on function public.pulse_read_snapshot(timestamptz,timestamptz) to service_role;

revoke all on function public.pulse_validate_mcp_outcomes(jsonb) from public,anon,authenticated;
revoke all on function public.pulse_merge_mcp_outcomes(jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.pulse_validate_delta(jsonb) from public,anon,authenticated;
