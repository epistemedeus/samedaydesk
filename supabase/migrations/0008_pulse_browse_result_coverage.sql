-- Prospective browse cardinality in the EXISTING MCP aggregate; no new table/ledger.
-- Forward, rerunnable function extension. Old fields, rows, deltas, flush IDs and
-- hashes stay unchanged. Apply before the producer; do not down-migrate or strip
-- new WAL fields on rollback. Old readers cannot validate new events/timestamp.
create or replace function public.pulse_validate_mcp_outcomes(p_value jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  v_key text; v_parts text[]; v_time timestamptz; v_browse_time timestamptz; v_counts jsonb;
  v_sources text[] := array['unattributed','agentverse-a2a-v1'];
  v_tools text[] := array['_none','_unknown','check_ai_readiness','generate_complete_fix_pack','plan_taskmarket_delegation','browse_taskmarket_tasks','track_taskmarket_task','check_agent_readiness','project_funnel_evidence'];
  v_events text[] := array['http_request','tool_attempt','normal_result','tool_refusal','protocol_error','notification_completed','response_finished','disconnected'];
begin
  if jsonb_typeof(p_value) is distinct from 'object'
    or (select count(*) from jsonb_object_keys(p_value) k where k not in ('observedFrom','counts','browseObservedFrom')) <> 0
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
  if p_value ? 'browseObservedFrom' then
    if jsonb_typeof(p_value->'browseObservedFrom') is distinct from 'string'
      or (p_value->>'browseObservedFrom') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$' then
      raise exception 'pulse_invalid_field:mcpOutcomes' using errcode='22023';
    end if;
    begin
      v_browse_time := (p_value->>'browseObservedFrom')::timestamptz;
    exception when others then
      raise exception 'pulse_invalid_field:mcpOutcomes' using errcode='22023';
    end;
    if not isfinite(v_browse_time) or v_browse_time < v_time
      or to_char(v_browse_time at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') <> (p_value->>'browseObservedFrom') then
      raise exception 'pulse_invalid_field:mcpOutcomes' using errcode='22023';
    end if;
  end if;
  -- Reject arbitrary labels before a shared validator could include a raw key
  -- in its diagnostic field path. Only fixed keys reach that validator.
  for v_key in select jsonb_object_keys(p_value->'counts') loop
    v_parts := string_to_array(v_key,'|');
    if cardinality(v_parts) <> 3 or not (v_parts[1]=any(v_sources))
      or not (v_parts[2]=any(v_tools)) or not (v_parts[3]=any(v_events) or (v_parts[2]='browse_taskmarket_tasks' and v_parts[3]=any(array['browse_empty','browse_non_empty','browse_unclassified']) and v_browse_time is not null)) then
      raise exception 'pulse_invalid_field:mcpOutcomes' using errcode='22023';
    end if;
  end loop;
  v_counts := public.pulse_validate_counter_map(p_value->'counts','mcpOutcomes',null,150,96);
  for v_key in select jsonb_object_keys(v_counts) loop
    if (v_counts->>v_key)::numeric > 9007199254740991 then
      raise exception 'pulse_invalid_field:mcpOutcomes' using errcode='22023';
    end if;
  end loop;
  return jsonb_build_object('observedFrom',to_char(v_time at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'counts',v_counts) || case when v_browse_time is not null then jsonb_build_object('browseObservedFrom',p_value->>'browseObservedFrom') else '{}'::jsonb end;
end; $$;

create or replace function public.pulse_merge_mcp_outcomes(p_base jsonb,p_add jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select case when p_base is null then p_add when p_add is null then p_base else
    jsonb_build_object('observedFrom',least(p_base->>'observedFrom',p_add->>'observedFrom'),
      'counts',public.pulse_merge_counter_maps(p_base->'counts',p_add->'counts')) || case when p_base ? 'browseObservedFrom' or p_add ? 'browseObservedFrom' then jsonb_build_object('browseObservedFrom',least(p_base->>'browseObservedFrom',p_add->>'browseObservedFrom')) else '{}'::jsonb end end;
$$;

revoke all on function public.pulse_validate_mcp_outcomes(jsonb) from public,anon,authenticated;
revoke all on function public.pulse_merge_mcp_outcomes(jsonb,jsonb) from public,anon,authenticated;
