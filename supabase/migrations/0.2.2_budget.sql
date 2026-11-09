-- =========================================================
--  Flunora 0.2.2 — budget mensile
--  Da incollare in: Supabase > SQL Editor > New query > Run
--  Si può eseguire più volte senza problemi. Non cancella dati.
--
--  Il budget fisso (valido per tutti i mesi) è salvato nelle impostazioni
--  sincronizzate (tabella user_settings, script 0.1.2).
--  Questa tabella contiene solo i budget cambiati per un singolo mese.
-- =========================================================

create table if not exists public.budgets (
  user_id       uuid not null references auth.users(id) on delete cascade default auth.uid(),
  month         date not null check (extract(day from month) = 1),   -- primo giorno del mese
  amount_cents  int  not null check (amount_cents > 0),              -- 150000 = 1.500,00 €
  updated_at    timestamptz not null default now(),
  primary key (user_id, month)
);

alter table public.budgets enable row level security;

drop policy if exists "budget propri" on public.budgets;
create policy "budget propri" on public.budgets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
