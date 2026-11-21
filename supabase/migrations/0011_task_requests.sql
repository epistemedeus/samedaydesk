-- Custom task requests from the "A harder problem? Tell us the task" form (selling rules 6d:
-- a custom job's action is a form that confirms on screen and by email).
create table if not exists public.task_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text not null check (char_length(email) between 3 and 254),
  website text check (website is null or char_length(website) <= 300),
  task text not null check (char_length(task) between 10 and 4000),
  status text not null default 'received' check (status in ('received', 'quoted', 'paid', 'closed'))
);
alter table public.task_requests enable row level security;
-- No public policies: only the server's service role reads or writes requests.
