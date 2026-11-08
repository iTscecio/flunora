-- =========================================================
--  Flunora 0.1.2 — impostazioni sincronizzate (sezioni della barra)
--  Da incollare in: Supabase > SQL Editor > New query > Run
--  Si può eseguire più volte senza problemi.
-- =========================================================

create table if not exists public.user_settings (
  user_id     uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  data        jsonb not null default '{}'::jsonb,   -- es. {"sections":[{"id":"dashboard","on":true}, ...]}
  updated_at  timestamptz not null default now()
);

alter table public.user_settings enable row level security;

drop policy if exists "impostazioni proprie" on public.user_settings;
create policy "impostazioni proprie" on public.user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
