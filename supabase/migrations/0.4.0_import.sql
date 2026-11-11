-- =========================================================
--  Flunora 0.4.0 — import dell'estratto conto
--  Da incollare in: Supabase > SQL Editor > New query > Run
--  Si può eseguire più volte senza problemi. Non cancella dati.
--  Serve aver già eseguito lo script 0.3.3.
--
--  1. import_batches: registro delle importazioni (per poterle annullare)
--  2. transactions.import_batch / import_key: da quale importazione arriva un
--     movimento e la sua "impronta", unica per utente -> niente doppioni
--  3. import_rules: negozio -> categoria, ricordati per la volta dopo
--  4. import_transactions(): importa tutto in un'unica operazione
--     undo_import(): toglie i movimenti di un'importazione
--  5. restore_backup(): conserva impronte e regole
-- =========================================================

-- 1. registro delle importazioni
create table if not exists public.import_batches (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at   timestamptz not null default now(),
  bank         text not null,
  account      text,                 -- solo le ultime cifre del conto
  period_from  date,
  period_to    date,
  file_name    text,
  n_added      int not null default 0,
  undone_at    timestamptz           -- quando è stata annullata
);
alter table public.import_batches enable row level security;
drop policy if exists "importazioni proprie" on public.import_batches;
create policy "importazioni proprie" on public.import_batches
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2. provenienza e impronta dei movimenti importati
alter table public.transactions add column if not exists import_batch uuid references public.import_batches(id) on delete set null;
alter table public.transactions add column if not exists import_key text;
create unique index if not exists transactions_import_key on public.transactions (user_id, import_key) where import_key is not null;
create index if not exists transactions_import_batch on public.transactions (import_batch) where import_batch is not null;

-- 3. regole negozio -> categoria
create table if not exists public.import_rules (
  user_id      uuid not null references auth.users(id) on delete cascade default auth.uid(),
  pattern      text not null,
  category_id  uuid not null references public.categories(id) on delete cascade,
  updated_at   timestamptz not null default now(),
  primary key (user_id, pattern)
);
alter table public.import_rules enable row level security;
drop policy if exists "regole proprie" on public.import_rules;
create policy "regole proprie" on public.import_rules
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 4a. importa: crea l'importazione e aggiunge i movimenti che non ci sono già
create or replace function public.import_transactions(meta jsonb, rows jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  bid uuid;
  n int := 0;
begin
  if uid is null then raise exception 'Accesso richiesto'; end if;
  if jsonb_typeof(rows) <> 'array' then raise exception 'Dati non validi'; end if;

  insert into public.import_batches (user_id, bank, account, period_from, period_to, file_name)
  values (uid, coalesce(meta ->> 'bank', '?'), meta ->> 'account',
          (meta ->> 'period_from')::date, (meta ->> 'period_to')::date, meta ->> 'file_name')
  returning id into bid;

  with ins as (
    insert into public.transactions (user_id, date, amount_cents, kind, category_id, description, import_batch, import_key)
    select uid, r.date, r.amount_cents, r.kind, r.category_id, nullif(r.description, ''), bid, r.import_key
      from jsonb_to_recordset(rows)
           as r(date date, amount_cents int, kind text, category_id uuid, description text, import_key text)
      join public.categories c on c.id = r.category_id and c.user_id = uid
    on conflict (user_id, import_key) where import_key is not null do nothing
    returning 1
  )
  select count(*) into n from ins;

  update public.import_batches set n_added = n where id = bid;
  return jsonb_build_object('batch_id', bid, 'added', n, 'skipped', jsonb_array_length(rows) - n);
end;
$$;

-- 4b. annulla: toglie i movimenti di quell'importazione (anche se poi modificati)
create or replace function public.undo_import(batch uuid)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  n int;
begin
  if uid is null then raise exception 'Accesso richiesto'; end if;
  delete from public.transactions where user_id = uid and import_batch = batch;
  get diagnostics n = row_count;
  update public.import_batches set undone_at = now() where id = batch and user_id = uid and undone_at is null;
  return n;
end;
$$;

-- 5. ripristino di un backup
create or replace function public.restore_backup(payload jsonb, replace_all boolean default false)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  c   jsonb;
  existing uuid;
  n_cat int := 0;
  n_tx_in int := 0;
  n_tx int := 0;
  n_bud int := 0;
  cat_map jsonb := '{}'::jsonb;   -- id della categoria nel backup -> id nel database
begin
  if uid is null then
    raise exception 'Accesso richiesto';
  end if;
  if jsonb_typeof(payload -> 'categories') <> 'array' or jsonb_typeof(payload -> 'transactions') <> 'array' then
    raise exception 'Backup non valido';
  end if;

  -- 1. Sostituisci tutto: via i dati attuali (nell'ordine giusto per i collegamenti)
  if replace_all then
    delete from public.transactions where user_id = uid;
    delete from public.recurring    where user_id = uid;
    delete from public.budgets      where user_id = uid;
    delete from public.categories   where user_id = uid;
  end if;

  -- 2. Categorie: stessa categoria (id o tipo+nome) -> riusa; altrimenti la crea
  for c in select * from jsonb_array_elements(payload -> 'categories') loop
    select id into existing from public.categories
     where user_id = uid
       and (id = (c ->> 'id')::uuid or (kind = c ->> 'kind' and lower(name) = lower(c ->> 'name')))
     order by (id = (c ->> 'id')::uuid) desc
     limit 1;
    if existing is null then
      insert into public.categories (user_id, name, kind, color, icon, archived, sort_order, budget_cents)
      values (uid, c ->> 'name', c ->> 'kind',
              coalesce(c ->> 'color', '#8e8e93'), coalesce(c ->> 'icon', 'tag'),
              coalesce((c ->> 'archived')::boolean, false), coalesce((c ->> 'sort_order')::int, 0),
              case when c ->> 'kind' = 'uscita' then nullif((c ->> 'budget_cents')::int, 0) end)
      returning id into existing;
      n_cat := n_cat + 1;
    elsif c ->> 'kind' = 'uscita' and nullif((c ->> 'budget_cents')::int, 0) is not null then
      -- 0.3.3: categoria già presente senza budget -> prende quello del backup
      update public.categories set budget_cents = (c ->> 'budget_cents')::int
       where id = existing and budget_cents is null;
    end if;
    cat_map := cat_map || jsonb_build_object(c ->> 'id', existing);
  end loop;

  -- 3. Movimenti: con "Unisci" aggiunge solo quelli che mancano.
  --    Movimenti identici (stessa data, importo, tipo, categoria, descrizione) si contano:
  --    se il backup ne ha 2 e l'app 1, ne aggiunge 1.
  n_tx_in := jsonb_array_length(payload -> 'transactions');
  with src as (
    select t.date, t.amount_cents, t.kind, (cat_map ->> t.category_id)::uuid as category_id,
           coalesce(nullif(t.description, ''), '') as description, t.import_key
      from jsonb_to_recordset(payload -> 'transactions')
           as t(date date, amount_cents int, kind text, category_id text, description text, import_key text)
     where cat_map ? t.category_id
  ), numbered as (
    select s.*, row_number() over (partition by s.date, s.amount_cents, s.kind, s.category_id, s.description) as rn
      from src s
  ), have as (
    select x.date, x.amount_cents, x.kind, x.category_id, coalesce(x.description, '') as description, count(*) as n
      from public.transactions x
     where x.user_id = uid and not replace_all
     group by 1, 2, 3, 4, 5
  ), ins as (
    insert into public.transactions (user_id, date, amount_cents, kind, category_id, description, import_key)
    select uid, s.date, s.amount_cents, s.kind, s.category_id, nullif(s.description, ''), s.import_key
      from numbered s
      left join have h using (date, amount_cents, kind, category_id, description)
     where s.rn > coalesce(h.n, 0)
    on conflict (user_id, import_key) where import_key is not null do nothing   -- 0.4.0: già importato
    returning 1
  )
  select count(*) into n_tx from ins;

  -- 4. Budget dei singoli mesi: con "Unisci" tiene quelli attuali
  if jsonb_typeof(payload -> 'budgets') = 'array' then
    with ins as (
      insert into public.budgets (user_id, month, amount_cents)
      select uid, b.month, b.amount_cents
        from jsonb_to_recordset(payload -> 'budgets') as b(month date, amount_cents int)
      on conflict (user_id, month) do nothing
      returning 1
    )
    select count(*) into n_bud from ins;
  end if;

  -- 5. 0.4.0: regole dei negozi (negozio -> categoria), solo quelle che mancano
  if jsonb_typeof(payload -> 'import_rules') = 'array' then
    insert into public.import_rules (user_id, pattern, category_id)
    select uid, r.pattern, (cat_map ->> r.category_id)::uuid
      from jsonb_to_recordset(payload -> 'import_rules') as r(pattern text, category_id text)
     where cat_map ? r.category_id
    on conflict (user_id, pattern) do nothing;
  end if;

  return jsonb_build_object(
    'categories_added', n_cat,
    'transactions_added', n_tx,
    'transactions_skipped', n_tx_in - n_tx,
    'budgets_added', n_bud
  );
end;
$$;
