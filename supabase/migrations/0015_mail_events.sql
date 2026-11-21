-- Signed provider delivery observations. Recipients and message bodies are not copied.
create table if not exists public.mail_events (
  event_id text primary key,
  email_id text not null,
  event_type text not null check (event_type in ('email.delivered','email.bounced','email.complained','email.failed','email.suppressed')),
  test boolean not null,
  created_at timestamptz not null default now()
);
alter table public.mail_events enable row level security;
