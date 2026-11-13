-- =========================================================
--  Flunora 0.6.2 — PROVA GRATUITA E PROMEMORIA PER DISDIRE
--  Per gli abbonamenti: fine della prova gratuita, data entro cui decidere se
--  disdire e quanti giorni prima avvisare. Il ripristino dei backup li include.
--
--  Si può rieseguire: aggiunge solo ciò che manca e non cancella dati.
-- =========================================================

-- 1. nuove colonne
alter table public.recurring add column if not exists trial_end   date;
alter table public.recurring add column if not exists cancel_by   date;
alter table public.recurring add column if not exists notice_days int not null default 3;
alter table public.recurring drop constraint if exists recurring_notice_days_check;
alter table public.recurring add  constraint recurring_notice_days_check check (notice_days between 0 and 30);

-- 2. backup: il ripristino include prova e disdetta (stessa funzione della 0.6.0, parte 8 ampliata)
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
  n_wish int := 0;
  n_rec int := 0;
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
    delete from public.recurring    where user_id = uid;   -- 0.6.0 (prima dei desideri a cui sono collegati)
    delete from public.wishes       where user_id = uid;   -- 0.5.0
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

  -- 7. 0.5.0: desideri; con "Unisci" salta quelli già presenti (stesso nome e prezzo)
  if jsonb_typeof(payload -> 'wishes') = 'array' then
    with ins as (
      insert into public.wishes (user_id, name, price_cents, saved_cents, due_date, link, note, sort_order, status, closed_on)
      select uid, w.name, w.price_cents, coalesce(w.saved_cents, 0), w.due_date, w.link, w.note, coalesce(w.sort_order, 0),
             coalesce(w.status, 'attivo'),
             case when coalesce(w.status, 'attivo') = 'attivo' then null else coalesce(w.closed_on, current_date) end
        from jsonb_to_recordset(payload -> 'wishes')
             as w(name text, price_cents int, saved_cents int, due_date date, link text, note text, sort_order int, status text, closed_on date)
       where not exists (select 1 from public.wishes x
                          where x.user_id = uid and lower(x.name) = lower(w.name) and x.price_cents = w.price_cents)
      returning 1
    )
    select count(*) into n_wish from ins;
  end if;

  -- 8. 0.6.0: abbonamenti, pagamenti periodici e risparmio periodico (solo quelli del nuovo formato,
  --    con la data di partenza); con "Unisci" salta quelli già presenti (stesso tipo, descrizione,
  --    importo, frequenza e giorno). Il risparmio si ricollega al desiderio con lo stesso nome.
  --    L'ultima data aggiunta resta quella del backup: i movimenti già ripristinati non si ripetono.
  if jsonb_typeof(payload -> 'recurring') = 'array' then
    with src as (
      select r.*, (cat_map ->> r.category_id)::uuid as cat,
             (select w.id from public.wishes w
               where w.user_id = uid and r.wish_name is not null and lower(w.name) = lower(r.wish_name)
               order by (w.status = 'attivo') desc, w.created_at desc limit 1) as wish
        from jsonb_to_recordset(payload -> 'recurring')
             as r(kind text, category_id text, description text, amount_cents int, frequency text,
                  day_of_month int, month_of_year int, start_date date, last_date date, active boolean,
                  is_subscription boolean, wish_name text, trial_end date, cancel_by date, notice_days int)
       where r.start_date is not null
    ), ins as (
      insert into public.recurring (user_id, kind, category_id, description, amount_cents, frequency, day_of_month,
                                    month_of_year, start_date, last_date, active, is_subscription, wish_id,
                                    trial_end, cancel_by, notice_days)
      select uid, s.kind, s.cat, s.description, s.amount_cents, coalesce(s.frequency, 'mese'), s.day_of_month,
             s.month_of_year, s.start_date, s.last_date, coalesce(s.active, true), coalesce(s.is_subscription, false), s.wish,
             s.trial_end, s.cancel_by, coalesce(s.notice_days, 3)
        from src s
       where (s.kind = 'risparmio' or s.cat is not null)
         and (s.kind <> 'risparmio' or s.wish_name is null or s.wish is not null)
         and not exists (select 1 from public.recurring x
                          where x.user_id = uid and x.kind = s.kind and x.description = s.description
                            and x.amount_cents = s.amount_cents and x.frequency = coalesce(s.frequency, 'mese')
                            and x.day_of_month = s.day_of_month)
      returning 1
    )
    select count(*) into n_rec from ins;
  end if;

  return jsonb_build_object(
    'recurring_added', n_rec,
    'wishes_added', n_wish,
    'advances_added', n_adv,
    'categories_added', n_cat,
    'transactions_added', n_tx,
    'transactions_skipped', n_tx_in - n_tx,
    'budgets_added', n_bud
  );
end;
$$;
