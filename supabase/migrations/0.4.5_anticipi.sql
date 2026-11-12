-- =========================================================
--  Flunora 0.4.5 — ANTICIPI
--  Soldi pagati per altri che verranno restituiti.
--  Non sono movimenti: non contano in budget, "Ti restano", Categorie e totali mensili.
--  Il saldo totale li considera nell'app: scende quando paghi, risale quando
--  ti restituiscono i soldi sul conto (o quando la quota diventa una spesa).
--  La "mia parte" è un normale movimento di uscita, collegato all'anticipo.
--
--  Si può rieseguire: crea solo ciò che manca e non cancella dati.
-- =========================================================

-- 1. anticipi
create table if not exists public.advances (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date             date not null,
  description      text not null check (char_length(description) between 1 and 120),
  total_cents      integer not null check (total_cents > 0),
  own_cents        integer not null default 0 check (own_cents >= 0),
  own_category_id  uuid references public.categories (id) on delete set null,
  own_tx_id        uuid references public.transactions (id) on delete set null,
  created_at       timestamptz not null default now(),
  check (own_cents < total_cents)
);
create index if not exists advances_user_date_idx on public.advances (user_id, date desc);

-- 2. quote: chi deve restituire quanto, e com'è andata
--    status: aperta · conto (restituita sul conto) · contanti · persa (diventata una spesa)
create table if not exists public.advance_shares (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  advance_id   uuid not null references public.advances (id) on delete cascade,
  person       text not null check (char_length(person) between 1 and 60),
  amount_cents integer not null check (amount_cents > 0),
  status       text not null default 'aperta' check (status in ('aperta', 'conto', 'contanti', 'persa')),
  closed_on    date,
  lost_tx_id   uuid references public.transactions (id) on delete set null,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  check ((status = 'aperta') = (closed_on is null))
);
create index if not exists advance_shares_advance_idx on public.advance_shares (advance_id);
create index if not exists advance_shares_user_status_idx on public.advance_shares (user_id, status);

-- 3. regole per utente: ognuno vede e modifica solo i propri dati
alter table public.advances enable row level security;
alter table public.advance_shares enable row level security;

drop policy if exists "advances: solo i propri" on public.advances;
create policy "advances: solo i propri" on public.advances
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "advance_shares: solo i propri" on public.advance_shares;
create policy "advance_shares: solo i propri" on public.advance_shares
  for all using (user_id = auth.uid()) with check (
    user_id = auth.uid()
    and exists (select 1 from public.advances a where a.id = advance_id and a.user_id = auth.uid())
  );

-- 4. backup: il ripristino include anche gli anticipi
--    (stessa funzione della 0.4.0, con in più la parte 6 e la pulizia degli anticipi in "Sostituisci tutto")
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
  n_adv int := 0;
  a   jsonb;
  new_adv uuid;
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
    delete from public.advances     where user_id = uid;   -- 0.4.5 (le quote si eliminano con l'anticipo)
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

  -- 6. 0.4.5: anticipi con le quote; con "Unisci" salta quelli già presenti (stessa data, descrizione, totale)
  if jsonb_typeof(payload -> 'advances') = 'array' then
    for a in select * from jsonb_array_elements(payload -> 'advances') loop
      continue when exists (
        select 1 from public.advances x
         where x.user_id = uid and x.date = (a ->> 'date')::date
           and x.description = a ->> 'description' and x.total_cents = (a ->> 'total_cents')::int);
      insert into public.advances (user_id, date, description, total_cents, own_cents, own_category_id)
      values (uid, (a ->> 'date')::date, a ->> 'description', (a ->> 'total_cents')::int,
              coalesce((a ->> 'own_cents')::int, 0), (cat_map ->> (a ->> 'own_category_id'))::uuid)
      returning id into new_adv;
      insert into public.advance_shares (user_id, advance_id, person, amount_cents, status, closed_on, sort_order)
      select uid, new_adv, q.person, q.amount_cents, coalesce(q.status, 'aperta'),
             case when coalesce(q.status, 'aperta') = 'aperta' then null else coalesce(q.closed_on, (a ->> 'date')::date) end,
             (row_number() over ())::int - 1
        from jsonb_to_recordset(coalesce(a -> 'shares', '[]'::jsonb))
             as q(person text, amount_cents int, status text, closed_on date);
      n_adv := n_adv + 1;
    end loop;
  end if;

  return jsonb_build_object(
    'advances_added', n_adv,
    'categories_added', n_cat,
    'transactions_added', n_tx,
    'transactions_skipped', n_tx_in - n_tx,
    'budgets_added', n_bud
  );
end;
$$;
