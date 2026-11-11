-- =========================================================
--  Flunora 0.3.0 — ripristino di un backup
--  Da incollare in: Supabase > SQL Editor > New query > Run
--  Si può eseguire più volte senza problemi. Non cancella dati.
--
--  restore_backup(payload, replace_all) lavora in un'unica operazione:
--  se qualcosa va storto non cambia nulla.
--   - replace_all = false  -> "Unisci": aggiunge solo ciò che manca
--   - replace_all = true   -> "Sostituisci tutto": cancella i dati attuali
--                             dell'utente e li rimpiazza con quelli del backup
--  Lavora solo sui dati dell'utente collegato (regole di sicurezza attive).
-- =========================================================

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
      insert into public.categories (user_id, name, kind, color, icon, archived, sort_order)
      values (uid, c ->> 'name', c ->> 'kind',
              coalesce(c ->> 'color', '#8e8e93'), coalesce(c ->> 'icon', 'tag'),
              coalesce((c ->> 'archived')::boolean, false), coalesce((c ->> 'sort_order')::int, 0))
      returning id into existing;
      n_cat := n_cat + 1;
    end if;
    cat_map := cat_map || jsonb_build_object(c ->> 'id', existing);
  end loop;

  -- 3. Movimenti: con "Unisci" aggiunge solo quelli che mancano.
  --    Movimenti identici (stessa data, importo, tipo, categoria, descrizione) si contano:
  --    se il backup ne ha 2 e l'app 1, ne aggiunge 1.
  n_tx_in := jsonb_array_length(payload -> 'transactions');
  with src as (
    select t.date, t.amount_cents, t.kind, (cat_map ->> t.category_id)::uuid as category_id,
           coalesce(nullif(t.description, ''), '') as description
      from jsonb_to_recordset(payload -> 'transactions')
           as t(date date, amount_cents int, kind text, category_id text, description text)
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
    insert into public.transactions (user_id, date, amount_cents, kind, category_id, description)
    select uid, s.date, s.amount_cents, s.kind, s.category_id, nullif(s.description, '')
      from numbered s
      left join have h using (date, amount_cents, kind, category_id, description)
     where s.rn > coalesce(h.n, 0)
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

  return jsonb_build_object(
    'categories_added', n_cat,
    'transactions_added', n_tx,
    'transactions_skipped', n_tx_in - n_tx,
    'budgets_added', n_bud
  );
end;
$$;
