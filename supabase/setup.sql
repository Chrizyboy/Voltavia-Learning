-- Voltavia Learning – Supabase-Einrichtung
-- 1) Im Supabase-Dashboard: SQL Editor → New query → alles einfügen → Run
-- 2) Authentication → Sign In / Providers → «Allow anonymous sign-ins» einschalten

create table if not exists public.learners (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text,
  email       text,
  goal        text,
  progress    jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.learners enable row level security;

-- Jede/r Lernende sieht und ändert nur die eigene Zeile. Du siehst alle im Dashboard (Table Editor).
drop policy if exists "learners_select_own" on public.learners;
drop policy if exists "learners_insert_own" on public.learners;
drop policy if exists "learners_update_own" on public.learners;
create policy "learners_select_own" on public.learners for select to authenticated using (auth.uid() = id);
create policy "learners_insert_own" on public.learners for insert to authenticated with check (auth.uid() = id);
create policy "learners_update_own" on public.learners for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- Übersicht für dich (nur im Dashboard sichtbar, nicht für die App)
create or replace view public.learners_overview with (security_invoker = true) as
select name, email, goal, created_at, updated_at,
       (select count(*) from jsonb_object_keys(coalesce(progress->'lessons','{}'::jsonb))) as lektionen_erledigt,
       (select count(*) from jsonb_each(coalesce(progress->'exams','{}'::jsonb)) e where (e.value->>'passed')::boolean) as pruefungen_bestanden
from public.learners order by updated_at desc;
