-- ============================================================
-- Crossway database setup
-- Paste this whole file into Supabase > SQL Editor > New query, then click Run.
-- BEFORE running: change the email on the line marked  >>> CHANGE THIS <<<
-- It is safe to run more than once.
-- ============================================================

-- 1. Tables ----------------------------------------------------

create table if not exists public.projects (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.tasks (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id  text,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists projects_user_idx on public.projects(user_id);
create index if not exists tasks_user_idx    on public.tasks(user_id);

-- keep updated_at fresh
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

drop trigger if exists projects_touch on public.projects;
create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();
drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();

-- 2. Privacy: every person only sees and edits their own rows ---

alter table public.projects enable row level security;
alter table public.tasks    enable row level security;

drop policy if exists "own projects" on public.projects;
create policy "own projects" on public.projects
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "own tasks" on public.tasks;
create policy "own tasks" on public.tasks
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.projects, public.tasks to authenticated;

-- 3. Admins (who can open the stats page) ----------------------

create table if not exists public.app_admins (email text primary key);
alter table public.app_admins enable row level security;   -- no policies: not readable from the website

insert into public.app_admins(email)
values (lower('anuj.wn7@gmail.com'))                        -- >>> CHANGE THIS <<< if you sign in with a different email
on conflict do nothing;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.app_admins
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- 4. Stats for the admin page ----------------------------------

create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'generated_at',     now(),
    'total_users',      (select count(*) from auth.users),
    'new_today',        (select count(*) from auth.users where created_at >= date_trunc('day', now())),
    'new_7d',           (select count(*) from auth.users where created_at >= now() - interval '7 days'),
    'new_30d',          (select count(*) from auth.users where created_at >= now() - interval '30 days'),
    'active_7d',        (select count(*) from auth.users where last_sign_in_at >= now() - interval '7 days'),
    'google_users',     (select count(*) from auth.users where coalesce(raw_app_meta_data -> 'providers', '[]'::jsonb) ? 'google'),
    'email_users',      (select count(*) from auth.users where coalesce(raw_app_meta_data -> 'providers', '[]'::jsonb) ? 'email'),
    'unconfirmed',      (select count(*) from auth.users where email_confirmed_at is null),
    'total_projects',   (select count(*) from public.projects),
    'total_tasks',      (select count(*) from public.tasks),
    'tasks_done',       (select count(*) from public.tasks where data ->> 'status' = 'done'),
    'users_with_tasks', (select count(distinct user_id) from public.tasks),
    'before_window',    (select count(*) from auth.users where created_at < (current_date - 29)),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'count', coalesce(u.c, 0)) order by d.day), '[]'::jsonb)
      from (select generate_series(current_date - 29, current_date, interval '1 day')::date as day) d
      left join (select created_at::date as day, count(*) as c from auth.users group by 1) u on u.day = d.day
    ),
    'recent', (
      select coalesce(jsonb_agg(r), '[]'::jsonb) from (
        select u.email,
               coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', '') as name,
               coalesce(u.raw_app_meta_data ->> 'provider', 'email') as provider,
               u.created_at,
               u.last_sign_in_at,
               (select count(*) from public.tasks t where t.user_id = u.id) as tasks
        from auth.users u
        order by u.created_at desc
        limit 100
      ) r
    )
  ) into result;

  return result;
end $$;

revoke all on function public.admin_stats() from public, anon;
revoke all on function public.is_admin()    from public, anon;
grant execute on function public.admin_stats() to authenticated;
grant execute on function public.is_admin()    to authenticated;
