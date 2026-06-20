-- SameDayDesk — initial schema (Supabase Postgres + RLS).
-- Principle: clients read only their own rows; ALL value/status writes go through the
-- Express server using the service-role key (which bypasses RLS). RLS is default-deny:
-- a table with RLS enabled and no matching policy denies the operation for clients.

-- ───────────────────────── profiles (1:1 with auth.users) ─────────────────────────
create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  email          text,
  full_name      text,
  payment_status text not null default 'unpaid',  -- server-managed; clients can't write it
  created_at     timestamptz not null default now()
);
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
-- (no insert/update/delete policy → clients cannot write; trigger + server handle those)

grant select on public.profiles to authenticated;

-- Seed a profile row whenever a new auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────── orders (records of value) ─────────────────────────
create table if not exists public.orders (
  id                   text primary key,             -- deterministic: order_{uid}_{offer} (idempotency)
  user_id              uuid not null references auth.users(id) on delete cascade,
  offer                text not null,
  label                text,
  amount               integer not null,             -- cents
  currency             text not null default 'usd',
  status               text not null default 'received',
  stripe_payment_intent text,
  upload_path          text,                          -- supabase storage object path
  meta                 jsonb,
  created_at           timestamptz not null default now()
);
alter table public.orders enable row level security;

drop policy if exists "orders_select_own" on public.orders;
create policy "orders_select_own" on public.orders
  for select to authenticated using ((select auth.uid()) = user_id);
-- (no client write policy → server/service-role only)

grant select on public.orders to authenticated;
create index if not exists orders_user_id_idx on public.orders(user_id);

-- ───────────────────────── drafts (user intake working data) ─────────────────────────
create table if not exists public.drafts (
  user_id     uuid not null references auth.users(id) on delete cascade,
  offer       text not null,
  data        jsonb not null default '{}',
  upload_path text,
  updated_at  timestamptz not null default now(),
  primary key (user_id, offer)
);
alter table public.drafts enable row level security;

drop policy if exists "drafts_rw_own" on public.drafts;
create policy "drafts_rw_own" on public.drafts
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.drafts to authenticated;

-- ───────────────────────── email suppressions (server-managed) ─────────────────────────
create table if not exists public.email_suppressions (
  email      text primary key,
  reason     text,
  created_at timestamptz not null default now()
);
alter table public.email_suppressions enable row level security;
-- no policies → fully denied to clients; service-role bypasses.

-- ───────────────────────── storage: private intake bucket ─────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'intake-uploads', 'intake-uploads', false, 10485760,
  array[
    'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'
  ]
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public = excluded.public;

-- Per-user folder RLS on storage.objects: path = {uid}/{filename}
drop policy if exists "intake_insert_own" on storage.objects;
create policy "intake_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'intake-uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "intake_select_own" on storage.objects;
create policy "intake_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'intake-uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "intake_update_own" on storage.objects;
create policy "intake_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'intake-uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "intake_delete_own" on storage.objects;
create policy "intake_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'intake-uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);
