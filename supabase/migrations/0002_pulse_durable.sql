-- Pulse durable atomic aggregate store (SameDayDesk internal measurement).
-- Constant-size aggregate row plus idempotent flush receipts. No per-request rows.

-- ───────────────────────── constant-size aggregate ─────────────────────────
create table if not exists public.pulse_aggregate (
  classification_schema_version smallint primary key default 2,
  observation_started_at        timestamptz,
  total                         bigint not null default 0,
  humans                        bigint not null default 0,
  bots                          bigint not null default 0,
  ai_crawlers                   bigint not null default 0,
  mcp_surface_gets              bigint not null default 0,
  mcp_protocol_requests         bigint not null default 0,
  mcp_protocol_messages         bigint not null default 0,
  mcp_protocol_by_method        jsonb not null default '{}'::jsonb,
  by_path                       jsonb not null default '{}'::jsonb,
  by_referer                    jsonb not null default '{}'::jsonb,
  by_ai_bot                     jsonb not null default '{}'::jsonb,
  funnel                        jsonb not null default '{}'::jsonb,
  seller_repair                 jsonb not null default '{}'::jsonb,
  updated_at                    timestamptz not null default now(),
  constraint pulse_aggregate_total_nonneg check (total >= 0),
  constraint pulse_aggregate_humans_nonneg check (humans >= 0),
  constraint pulse_aggregate_bots_nonneg check (bots >= 0),
  constraint pulse_aggregate_ai_crawlers_nonneg check (ai_crawlers >= 0),
  constraint pulse_aggregate_mcp_surface_gets_nonneg check (mcp_surface_gets >= 0),
  constraint pulse_aggregate_mcp_protocol_requests_nonneg check (mcp_protocol_requests >= 0),
  constraint pulse_aggregate_mcp_protocol_messages_nonneg check (mcp_protocol_messages >= 0)
);

alter table public.pulse_aggregate enable row level security;

-- ───────────────────────── idempotent flush receipts ─────────────────────────
create table if not exists public.pulse_flush_receipts (
  flush_id                      uuid primary key,
  classification_schema_version smallint not null,
  delta_hash                    text not null,
  applied_at                    timestamptz not null default now()
);

alter table public.pulse_flush_receipts enable row level security;

-- ───────────────────────── incomplete legacy observations ─────────────────────────
create table if not exists public.pulse_legacy_observations (
  import_key                    text primary key,
  schema_version                smallint not null,
  observation_hash              text not null,
  note                          text not null,
  started_at                    timestamptz,
  total                         bigint not null default 0,
  humans                        bigint not null default 0,
  unique_humans                 bigint not null default 0,
  bots                          bigint not null default 0,
  ai_crawlers                   bigint not null default 0,
  by_path                       jsonb not null default '{}'::jsonb,
  by_referer                    jsonb not null default '{}'::jsonb,
  by_ai_bot                     jsonb not null default '{}'::jsonb,
  funnel                        jsonb not null default '{}'::jsonb,
  imported_at                   timestamptz not null default now(),
  constraint pulse_legacy_observations_total_nonneg check (total >= 0),
  constraint pulse_legacy_observations_humans_nonneg check (humans >= 0),
  constraint pulse_legacy_observations_unique_humans_nonneg check (unique_humans >= 0),
  constraint pulse_legacy_observations_bots_nonneg check (bots >= 0),
  constraint pulse_legacy_observations_ai_crawlers_nonneg check (ai_crawlers >= 0)
);

alter table public.pulse_legacy_observations enable row level security;

revoke all on public.pulse_aggregate from public, anon, authenticated;
revoke all on public.pulse_flush_receipts from public, anon, authenticated;
revoke all on public.pulse_legacy_observations from public, anon, authenticated;

grant select, insert, update, delete on public.pulse_aggregate to service_role;
grant select, insert, update, delete on public.pulse_flush_receipts to service_role;
grant select, insert, update, delete on public.pulse_legacy_observations to service_role;

-- ───────────────────────── validation helpers ─────────────────────────
create or replace function public.pulse_validate_nonneg_int(p_value jsonb, p_field text)
returns bigint
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_text text;
  v_num numeric;
begin
  if p_value is null or jsonb_typeof(p_value) <> 'number' then
    raise exception 'pulse_invalid_field:%', p_field using errcode = '22023';
  end if;
  v_text := p_value #>> '{}';
  if v_text ~ '\.' or v_text ~ '[eE]' then
    raise exception 'pulse_invalid_field:%', p_field using errcode = '22023';
  end if;
  v_num := (p_value #>> '{}')::numeric;
  if v_num < 0 or v_num > 9223372036854775807 or trunc(v_num) <> v_num then
    raise exception 'pulse_invalid_field:%', p_field using errcode = '22023';
  end if;
  return v_num::bigint;
end;
$$;

create or replace function public.pulse_validate_counter_map(
  p_map jsonb,
  p_field text,
  p_allowed_keys text[] default null,
  p_max_keys int default 200,
  p_max_key_len int default 96
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_key text;
  v_val bigint;
  v_count int := 0;
  v_out jsonb := '{}'::jsonb;
begin
  if p_map is null then
    return '{}'::jsonb;
  end if;
  if jsonb_typeof(p_map) <> 'object' then
    raise exception 'pulse_invalid_field:%', p_field using errcode = '22023';
  end if;
  if (select count(*)::int from jsonb_object_keys(p_map)) > p_max_keys then
    raise exception 'pulse_invalid_field:%', p_field using errcode = '22023';
  end if;
  for v_key, v_val in
    select key, public.pulse_validate_nonneg_int(value, p_field || '.' || key)
    from jsonb_each(p_map)
  loop
    v_count := v_count + 1;
    if length(v_key) = 0 or length(v_key) > p_max_key_len then
      raise exception 'pulse_invalid_field:%', p_field using errcode = '22023';
    end if;
    if p_allowed_keys is not null and not (v_key = any (p_allowed_keys)) then
      raise exception 'pulse_invalid_field:%', p_field using errcode = '22023';
    end if;
    v_out := v_out || jsonb_build_object(v_key, v_val);
  end loop;
  if v_count > p_max_keys then
    raise exception 'pulse_invalid_field:%', p_field using errcode = '22023';
  end if;
  return v_out;
end;
$$;

create or replace function public.pulse_merge_counter_maps(p_base jsonb, p_add jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_key text;
  v_add bigint;
  v_base bigint;
  v_out jsonb := coalesce(p_base, '{}'::jsonb);
begin
  if p_add is null or p_add = '{}'::jsonb then
    return v_out;
  end if;
  for v_key, v_add in
    select key, (value #>> '{}')::bigint from jsonb_each(p_add)
  loop
    v_base := coalesce((v_out ->> v_key)::bigint, 0);
    v_out := v_out || jsonb_build_object(v_key, v_base + v_add);
  end loop;
  return v_out;
end;
$$;

create or replace function public.pulse_validate_seller_repair(p_map jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_key text;
  v_row jsonb;
  v_route text;
  v_brief bigint;
  v_scope bigint;
  v_checkout bigint;
  v_out jsonb := jsonb_build_object('byFinding', '{}'::jsonb);
  v_allowed_route text[] := array['paid_get', 'paid_post'];
begin
  if p_map is null then
    return jsonb_build_object(
      'briefViews', 0,
      'scopeClicks', 0,
      'checkoutStarts', 0,
      'byFinding', '{}'::jsonb
    );
  end if;
  if jsonb_typeof(p_map) <> 'object' then
    raise exception 'pulse_invalid_field:sellerRepair' using errcode = '22023';
  end if;

  v_brief := public.pulse_validate_nonneg_int(p_map -> 'briefViews', 'sellerRepair.briefViews');
  v_scope := public.pulse_validate_nonneg_int(p_map -> 'scopeClicks', 'sellerRepair.scopeClicks');
  v_checkout := public.pulse_validate_nonneg_int(p_map -> 'checkoutStarts', 'sellerRepair.checkoutStarts');

  if p_map ? 'byFinding' then
    if jsonb_typeof(p_map -> 'byFinding') <> 'object' then
      raise exception 'pulse_invalid_field:sellerRepair.byFinding' using errcode = '22023';
    end if;
    if (select count(*)::int from jsonb_object_keys(p_map -> 'byFinding')) > 32 then
      raise exception 'pulse_invalid_field:sellerRepair.byFinding' using errcode = '22023';
    end if;
    for v_key, v_row in select key, value from jsonb_each(p_map -> 'byFinding')
    loop
      if length(v_key) = 0 or length(v_key) > 96 or v_key !~ '^[a-z0-9-]+$' then
        raise exception 'pulse_invalid_field:sellerRepair.byFinding' using errcode = '22023';
      end if;
      if jsonb_typeof(v_row) <> 'object' then
        raise exception 'pulse_invalid_field:sellerRepair.byFinding' using errcode = '22023';
      end if;
      v_route := v_row ->> 'routeClass';
      if v_route is null or not (v_route = any (v_allowed_route)) then
        raise exception 'pulse_invalid_field:sellerRepair.byFinding.routeClass' using errcode = '22023';
      end if;
      v_brief := public.pulse_validate_nonneg_int(v_row -> 'briefViews', 'sellerRepair.byFinding.briefViews');
      v_scope := public.pulse_validate_nonneg_int(v_row -> 'scopeClicks', 'sellerRepair.byFinding.scopeClicks');
      v_checkout := public.pulse_validate_nonneg_int(v_row -> 'checkoutStarts', 'sellerRepair.byFinding.checkoutStarts');
      v_out := jsonb_set(
        v_out,
        array['byFinding', v_key],
        jsonb_build_object(
          'routeClass', v_route,
          'briefViews', v_brief,
          'scopeClicks', v_scope,
          'checkoutStarts', v_checkout
        ),
        true
      );
    end loop;
  end if;

  return jsonb_build_object(
    'briefViews', public.pulse_validate_nonneg_int(p_map -> 'briefViews', 'sellerRepair.briefViews'),
    'scopeClicks', public.pulse_validate_nonneg_int(p_map -> 'scopeClicks', 'sellerRepair.scopeClicks'),
    'checkoutStarts', public.pulse_validate_nonneg_int(p_map -> 'checkoutStarts', 'sellerRepair.checkoutStarts'),
    'byFinding', coalesce(v_out -> 'byFinding', '{}'::jsonb)
  );
end;
$$;

create or replace function public.pulse_merge_seller_repair(p_base jsonb, p_add jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_key text;
  v_row jsonb;
  v_base_row jsonb;
  v_out jsonb;
  v_by jsonb;
begin
  v_out := coalesce(p_base, '{}'::jsonb);
  if p_add is null then
    return v_out;
  end if;
  v_out := jsonb_set(
    v_out,
    '{briefViews}',
    to_jsonb(coalesce((v_out ->> 'briefViews')::bigint, 0) + coalesce((p_add ->> 'briefViews')::bigint, 0)),
    true
  );
  v_out := jsonb_set(
    v_out,
    '{scopeClicks}',
    to_jsonb(coalesce((v_out ->> 'scopeClicks')::bigint, 0) + coalesce((p_add ->> 'scopeClicks')::bigint, 0)),
    true
  );
  v_out := jsonb_set(
    v_out,
    '{checkoutStarts}',
    to_jsonb(coalesce((v_out ->> 'checkoutStarts')::bigint, 0) + coalesce((p_add ->> 'checkoutStarts')::bigint, 0)),
    true
  );
  v_by := coalesce(v_out -> 'byFinding', '{}'::jsonb);
  for v_key, v_row in select key, value from jsonb_each(coalesce(p_add -> 'byFinding', '{}'::jsonb))
  loop
    v_base_row := coalesce(v_by -> v_key, jsonb_build_object(
      'routeClass', v_row ->> 'routeClass',
      'briefViews', 0,
      'scopeClicks', 0,
      'checkoutStarts', 0
    ));
    v_by := jsonb_set(
      v_by,
      array[v_key],
      jsonb_build_object(
        'routeClass', coalesce(v_base_row ->> 'routeClass', v_row ->> 'routeClass'),
        'briefViews', coalesce((v_base_row ->> 'briefViews')::bigint, 0) + coalesce((v_row ->> 'briefViews')::bigint, 0),
        'scopeClicks', coalesce((v_base_row ->> 'scopeClicks')::bigint, 0) + coalesce((v_row ->> 'scopeClicks')::bigint, 0),
        'checkoutStarts', coalesce((v_base_row ->> 'checkoutStarts')::bigint, 0) + coalesce((v_row ->> 'checkoutStarts')::bigint, 0)
      ),
      true
    );
  end loop;
  return jsonb_set(v_out, '{byFinding}', v_by, true);
end;
$$;

create or replace function public.pulse_validate_delta(p_delta jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_schema int;
  v_funnel_keys text[] := array['home', 'scan', 'tools', 'reports', 'guides', 'pricing'];
  v_mcp_keys text[] := array['initialize', 'tools/list', 'tools/call', 'notifications', 'other'];
begin
  if p_delta is null or jsonb_typeof(p_delta) <> 'object' then
    raise exception 'pulse_invalid_delta' using errcode = '22023';
  end if;

  if (select count(*) from jsonb_object_keys(p_delta) k
      where k not in (
        'schemaVersion', 'total', 'humans', 'bots', 'aiCrawlers',
        'mcpSurfaceGets', 'mcpProtocolRequests', 'mcpProtocolMessages',
        'mcpProtocolByMethod', 'byPath', 'byReferer', 'byAiBot', 'funnel', 'sellerRepair'
      )) > 0 then
    raise exception 'pulse_invalid_delta' using errcode = '22023';
  end if;

  v_schema := public.pulse_validate_nonneg_int(p_delta -> 'schemaVersion', 'schemaVersion')::int;
  if v_schema <> 2 then
    raise exception 'pulse_invalid_schema_version' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'schemaVersion', v_schema,
    'total', public.pulse_validate_nonneg_int(p_delta -> 'total', 'total'),
    'humans', public.pulse_validate_nonneg_int(p_delta -> 'humans', 'humans'),
    'bots', public.pulse_validate_nonneg_int(p_delta -> 'bots', 'bots'),
    'aiCrawlers', public.pulse_validate_nonneg_int(p_delta -> 'aiCrawlers', 'aiCrawlers'),
    'mcpSurfaceGets', public.pulse_validate_nonneg_int(p_delta -> 'mcpSurfaceGets', 'mcpSurfaceGets'),
    'mcpProtocolRequests', public.pulse_validate_nonneg_int(p_delta -> 'mcpProtocolRequests', 'mcpProtocolRequests'),
    'mcpProtocolMessages', public.pulse_validate_nonneg_int(p_delta -> 'mcpProtocolMessages', 'mcpProtocolMessages'),
    'mcpProtocolByMethod', public.pulse_validate_counter_map(p_delta -> 'mcpProtocolByMethod', 'mcpProtocolByMethod', v_mcp_keys, 8, 32),
    'byPath', public.pulse_validate_counter_map(p_delta -> 'byPath', 'byPath', null, 200, 60),
    'byReferer', public.pulse_validate_counter_map(p_delta -> 'byReferer', 'byReferer', null, 200, 96),
    'byAiBot', public.pulse_validate_counter_map(p_delta -> 'byAiBot', 'byAiBot', null, 64, 64),
    'funnel', public.pulse_validate_counter_map(p_delta -> 'funnel', 'funnel', v_funnel_keys, 8, 16),
    'sellerRepair', public.pulse_validate_seller_repair(p_delta -> 'sellerRepair')
  );
end;
$$;

create or replace function public.pulse_delta_hash(p_delta jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select md5(p_delta::text);
$$;

create or replace function public.pulse_legacy_observation_hash(p_observation jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select md5(p_observation::text);
$$;

-- ───────────────────────── atomic additive RPC ─────────────────────────
create or replace function public.pulse_apply_delta(p_flush_id uuid, p_delta jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delta jsonb;
  v_hash text;
  v_schema int;
  v_existing record;
begin
  if p_flush_id is null then
    raise exception 'pulse_invalid_flush_id' using errcode = '22023';
  end if;

  v_delta := public.pulse_validate_delta(p_delta);
  v_hash := public.pulse_delta_hash(v_delta);
  v_schema := (v_delta ->> 'schemaVersion')::int;

  select flush_id, delta_hash into v_existing
  from public.pulse_flush_receipts
  where flush_id = p_flush_id;

  if found then
    if v_existing.delta_hash <> v_hash then
      raise exception 'pulse_flush_id_conflict' using errcode = '22023';
    end if;
    return jsonb_build_object('status', 'already_applied', 'flushId', p_flush_id);
  end if;

  insert into public.pulse_aggregate as a (
    classification_schema_version,
    observation_started_at,
    total,
    humans,
    bots,
    ai_crawlers,
    mcp_surface_gets,
    mcp_protocol_requests,
    mcp_protocol_messages,
    mcp_protocol_by_method,
    by_path,
    by_referer,
    by_ai_bot,
    funnel,
    seller_repair
  ) values (
    v_schema,
    now(),
    (v_delta ->> 'total')::bigint,
    (v_delta ->> 'humans')::bigint,
    (v_delta ->> 'bots')::bigint,
    (v_delta ->> 'aiCrawlers')::bigint,
    (v_delta ->> 'mcpSurfaceGets')::bigint,
    (v_delta ->> 'mcpProtocolRequests')::bigint,
    (v_delta ->> 'mcpProtocolMessages')::bigint,
    v_delta -> 'mcpProtocolByMethod',
    v_delta -> 'byPath',
    v_delta -> 'byReferer',
    v_delta -> 'byAiBot',
    v_delta -> 'funnel',
    v_delta -> 'sellerRepair'
  )
  on conflict (classification_schema_version) do update set
    observation_started_at = coalesce(a.observation_started_at, excluded.observation_started_at),
    total = a.total + excluded.total,
    humans = a.humans + excluded.humans,
    bots = a.bots + excluded.bots,
    ai_crawlers = a.ai_crawlers + excluded.ai_crawlers,
    mcp_surface_gets = a.mcp_surface_gets + excluded.mcp_surface_gets,
    mcp_protocol_requests = a.mcp_protocol_requests + excluded.mcp_protocol_requests,
    mcp_protocol_messages = a.mcp_protocol_messages + excluded.mcp_protocol_messages,
    mcp_protocol_by_method = public.pulse_merge_counter_maps(a.mcp_protocol_by_method, excluded.mcp_protocol_by_method),
    by_path = public.pulse_merge_counter_maps(a.by_path, excluded.by_path),
    by_referer = public.pulse_merge_counter_maps(a.by_referer, excluded.by_referer),
    by_ai_bot = public.pulse_merge_counter_maps(a.by_ai_bot, excluded.by_ai_bot),
    funnel = public.pulse_merge_counter_maps(a.funnel, excluded.funnel),
    seller_repair = public.pulse_merge_seller_repair(a.seller_repair, excluded.seller_repair),
    updated_at = now();

  insert into public.pulse_flush_receipts (
    flush_id,
    classification_schema_version,
    delta_hash
  ) values (
    p_flush_id,
    v_schema,
    v_hash
  );

  return jsonb_build_object('status', 'applied', 'flushId', p_flush_id);
end;
$$;

-- ───────────────────────── bounded snapshot RPC (constant-size read) ─────────────────────────
create or replace function public.pulse_read_snapshot(
  p_observation_start timestamptz,
  p_observation_end timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_out jsonb;
  v_legacy record;
begin
  if p_observation_start is null then
    raise exception 'pulse_invalid_observation_start' using errcode = '22023';
  end if;
  if p_observation_end is null or p_observation_end < p_observation_start then
    raise exception 'pulse_invalid_observation_end' using errcode = '22023';
  end if;

  select * into v_row
  from public.pulse_aggregate
  where classification_schema_version = 2;

  v_out := jsonb_build_object(
    'schemaVersion', 2,
    'observationStart', coalesce(v_row.observation_started_at, p_observation_start),
    'observationEnd', p_observation_end,
    'total', coalesce(v_row.total, 0),
    'humans', coalesce(v_row.humans, 0),
    'bots', coalesce(v_row.bots, 0),
    'aiCrawlers', coalesce(v_row.ai_crawlers, 0),
    'mcpSurfaceGets', coalesce(v_row.mcp_surface_gets, 0),
    'mcpProtocolRequests', coalesce(v_row.mcp_protocol_requests, 0),
    'mcpProtocolMessages', coalesce(v_row.mcp_protocol_messages, 0),
    'mcpProtocolByMethod', coalesce(v_row.mcp_protocol_by_method, '{}'::jsonb),
    'byPath', coalesce(v_row.by_path, '{}'::jsonb),
    'byReferer', coalesce(v_row.by_referer, '{}'::jsonb),
    'byAiBot', coalesce(v_row.by_ai_bot, '{}'::jsonb),
    'funnel', coalesce(v_row.funnel, '{}'::jsonb),
    'sellerRepair', coalesce(
      v_row.seller_repair,
      jsonb_build_object('briefViews', 0, 'scopeClicks', 0, 'checkoutStarts', 0, 'byFinding', '{}'::jsonb)
    )
  );

  select * into v_legacy
  from public.pulse_legacy_observations
  where import_key = 'pr9_v1_migration'
  limit 1;

  if found then
    v_out := v_out || jsonb_build_object(
      'legacyUncertainty', jsonb_build_object(
        'schemaVersion', v_legacy.schema_version,
        'note', v_legacy.note,
        'startedAt', v_legacy.started_at,
        'total', v_legacy.total,
        'humans', v_legacy.humans,
        'uniqueHumans', v_legacy.unique_humans,
        'bots', v_legacy.bots,
        'aiCrawlers', v_legacy.ai_crawlers,
        'byPath', v_legacy.by_path,
        'byReferer', v_legacy.by_referer,
        'byAiBot', v_legacy.by_ai_bot,
        'funnel', v_legacy.funnel,
        'authority', 'incomplete_historical_evidence'
      )
    );
  end if;

  return v_out;
end;
$$;

-- ───────────────────────── idempotent legacy import RPC ─────────────────────────
create or replace function public.pulse_import_legacy_observation(
  p_import_key text,
  p_observation jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing record;
  v_note text;
  v_schema int;
  v_hash text;
begin
  if p_import_key is null or length(p_import_key) = 0 or length(p_import_key) > 64 then
    raise exception 'pulse_invalid_import_key' using errcode = '22023';
  end if;
  if p_observation is null or jsonb_typeof(p_observation) <> 'object' then
    raise exception 'pulse_invalid_legacy_observation' using errcode = '22023';
  end if;

  v_note := coalesce(
    p_observation ->> 'note',
    'Incomplete historical request-classification evidence. Not a complete traffic total.'
  );
  if length(v_note) > 512 then
    raise exception 'pulse_invalid_legacy_observation' using errcode = '22023';
  end if;

  v_schema := public.pulse_validate_nonneg_int(p_observation -> 'schemaVersion', 'schemaVersion')::int;
  if v_schema <> 1 then
    raise exception 'pulse_invalid_legacy_schema_version' using errcode = '22023';
  end if;

  v_hash := public.pulse_legacy_observation_hash(p_observation);

  select * into v_existing
  from public.pulse_legacy_observations
  where import_key = p_import_key;

  if found then
    if v_existing.observation_hash <> v_hash then
      raise exception 'pulse_legacy_import_conflict' using errcode = '22023';
    end if;
    return jsonb_build_object(
      'status', 'already_imported',
      'importKey', p_import_key,
      'authority', 'incomplete_historical_evidence'
    );
  end if;

  insert into public.pulse_legacy_observations (
    import_key,
    schema_version,
    observation_hash,
    note,
    started_at,
    total,
    humans,
    unique_humans,
    bots,
    ai_crawlers,
    by_path,
    by_referer,
    by_ai_bot,
    funnel
  ) values (
    p_import_key,
    v_schema,
    v_hash,
    v_note,
    nullif(p_observation ->> 'startedAt', '')::timestamptz,
    public.pulse_validate_nonneg_int(p_observation -> 'total', 'total'),
    public.pulse_validate_nonneg_int(p_observation -> 'humans', 'humans'),
    public.pulse_validate_nonneg_int(p_observation -> 'uniqueHumans', 'uniqueHumans'),
    public.pulse_validate_nonneg_int(p_observation -> 'bots', 'bots'),
    public.pulse_validate_nonneg_int(p_observation -> 'aiCrawlers', 'aiCrawlers'),
    public.pulse_validate_counter_map(p_observation -> 'byPath', 'byPath', null, 200, 60),
    public.pulse_validate_counter_map(p_observation -> 'byReferer', 'byReferer', null, 200, 96),
    public.pulse_validate_counter_map(p_observation -> 'byAiBot', 'byAiBot', null, 64, 64),
    public.pulse_validate_counter_map(
      p_observation -> 'funnel',
      'funnel',
      array['home', 'scan', 'tools', 'reports', 'guides', 'pricing'],
      8,
      16
    )
  );

  return jsonb_build_object(
    'status', 'imported',
    'importKey', p_import_key,
    'authority', 'incomplete_historical_evidence'
  );
end;
$$;

revoke all on function public.pulse_validate_nonneg_int(jsonb, text) from public, anon, authenticated;
revoke all on function public.pulse_validate_counter_map(jsonb, text, text[], int, int) from public, anon, authenticated;
revoke all on function public.pulse_merge_counter_maps(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.pulse_validate_seller_repair(jsonb) from public, anon, authenticated;
revoke all on function public.pulse_merge_seller_repair(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.pulse_validate_delta(jsonb) from public, anon, authenticated;
revoke all on function public.pulse_delta_hash(jsonb) from public, anon, authenticated;
revoke all on function public.pulse_legacy_observation_hash(jsonb) from public, anon, authenticated;
revoke all on function public.pulse_apply_delta(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.pulse_read_snapshot(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.pulse_import_legacy_observation(text, jsonb) from public, anon, authenticated;

grant execute on function public.pulse_apply_delta(uuid, jsonb) to service_role;
grant execute on function public.pulse_read_snapshot(timestamptz, timestamptz) to service_role;
grant execute on function public.pulse_import_legacy_observation(text, jsonb) to service_role;
