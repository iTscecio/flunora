-- =========================================================
--  Flunora 0.2.0 — gestione categorie
--  Da incollare in: Supabase > SQL Editor > New query > Run
--  Si può eseguire più volte senza problemi. Non cancella dati.
-- =========================================================

-- ---------- 1. Nuove colonne: icona e archiviazione ----------
alter table public.categories add column if not exists icon     text    not null default 'tag';
alter table public.categories add column if not exists archived boolean not null default false;

-- ---------- 2. Icone per le categorie che esistono già ----------
update public.categories set icon = case
    when name = 'Stipendio'    then 'briefcase'
    when name = 'Compleanno'   then 'gift'
    when name = 'Supermercato' then 'cart'
    when name = 'Benzina'      then 'fuel'
    when name = 'Svago'        then 'play'
    when name = 'Casa'         then 'home'
    when name = 'Abbonamenti'  then 'repeat'
    when name = 'Salute'       then 'health'
    when name = 'ETF'          then 'trend'
    when name = 'Altro'        then 'dots'
    else icon
  end
where icon = 'tag';

-- ---------- 3. Movimenti e totale dell'anno in corso per categoria ----------
create or replace view public.category_stats with (security_invoker = true) as
select
  user_id,
  category_id,
  count(*)::int          as n,
  sum(amount_cents)::bigint as total_cents
from public.transactions
where date >= date_trunc('year', current_date)::date
  and date <  (date_trunc('year', current_date) + interval '1 year')::date
group by user_id, category_id;

-- ---------- 4. Nuovo ordine delle categorie (in un colpo solo) ----------
create or replace function public.reorder_categories(ids uuid[])
returns void
language sql
security invoker
set search_path = public
as $$
  update public.categories c
     set sort_order = t.ord
    from unnest(ids) with ordinality as t(id, ord)
   where c.id = t.id;
$$;

-- ---------- 5. Elimina una categoria spostando prima i suoi movimenti ----------
--  Tutto avviene in un'unica operazione: se qualcosa va storto non cambia nulla.
create or replace function public.delete_category(cat uuid, move_to uuid default null)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  src public.categories%rowtype;
  dst public.categories%rowtype;
begin
  select * into src from public.categories where id = cat;
  if not found then
    raise exception 'Categoria non trovata';
  end if;

  if move_to is not null then
    select * into dst from public.categories where id = move_to;
    if not found or dst.kind <> src.kind or dst.id = src.id then
      raise exception 'Categoria di destinazione non valida';
    end if;
    update public.transactions set category_id = move_to where category_id = cat;
    update public.recurring    set category_id = move_to where category_id = cat;
  end if;

  delete from public.categories where id = cat;   -- fallisce se restano movimenti collegati
end;
$$;

-- ---------- 6. Categorie iniziali dei nuovi account, ora con icona ----------
create or replace function public.seed_default_categories()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.categories (user_id, name, kind, color, icon, sort_order) values
    (new.id, 'Stipendio',    'entrata',      '#34c759', 'briefcase', 1),
    (new.id, 'Compleanno',   'entrata',      '#ff9500', 'gift',      2),
    (new.id, 'Altro',        'entrata',      '#8e8e93', 'dots',      3),
    (new.id, 'Supermercato', 'uscita',       '#007aff', 'cart',      1),
    (new.id, 'Benzina',      'uscita',       '#ff3b30', 'fuel',      2),
    (new.id, 'Svago',        'uscita',       '#af52de', 'play',      3),
    (new.id, 'Casa',         'uscita',       '#30b0c7', 'home',      4),
    (new.id, 'Abbonamenti',  'uscita',       '#ff2d55', 'repeat',    5),
    (new.id, 'Salute',       'uscita',       '#00c7be', 'health',    6),
    (new.id, 'Altro',        'uscita',       '#8e8e93', 'dots',      7),
    (new.id, 'ETF',          'investimento', '#5856d6', 'trend',     1),
    (new.id, 'Altro',        'investimento', '#8e8e93', 'dots',      2);
  return new;
end;
$$;
