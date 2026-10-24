-- Read-only verification as schema owner, after 0009 on an authorized target.
-- The source qualification runs this against a disposable local cluster only.
begin;
do $$
declare
  v_old jsonb := '{"observedFrom":"2026-10-24T00:00:00.000Z","counts":{"unattributed|_none|protocol_error":6}}';
  v_new jsonb := '{"observedFrom":"2026-10-24T01:00:00.000Z","refusalObservedFrom":"2026-10-24T01:00:00.000Z","counts":{"unattributed|_none|refusal_unsupported_protocol":1}}';
  v_merged jsonb;
begin
  if public.pulse_validate_mcp_outcomes(v_old) <> v_old then raise exception 'old outcomes changed'; end if;
  v_merged := public.pulse_merge_mcp_outcomes(v_old, public.pulse_validate_mcp_outcomes(v_new));
  if v_merged->>'observedFrom' <> v_old->>'observedFrom'
     or v_merged->>'refusalObservedFrom' <> v_new->>'refusalObservedFrom'
     or v_merged->'counts'->>'unattributed|_none|protocol_error' <> '6' then
    raise exception 'refusal merge failed';
  end if;
  begin
    perform public.pulse_validate_mcp_outcomes(v_new - 'refusalObservedFrom');
    raise exception 'missing refusal boundary accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.pulse_validate_mcp_outcomes(v_new || '{"arbitrary":"field"}'::jsonb);
    raise exception 'unknown field accepted';
  exception when sqlstate '22023' then null;
  end;
end $$;
rollback;
