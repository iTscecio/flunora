-- =========================================================
--  Flunora 0.9.0 — PIÙ UTENTI
--  1. amministratore: chi vede "Utenti e spazio" (il primo account registrato, cioè il tuo)
--  2. admin_stats(): utenti, attivi, nuovi, spazio del database (solo per l'amministratore)
--  3. delete_my_account(): ogni utente può eliminare il proprio account e tutti i suoi dati
--
--  Si può rieseguire: aggiunge solo ciò che manca e non cancella dati.
-- =========================================================

-- 1. amministratori: tabella senza regole di accesso, quindi nessun utente la legge o la modifica dall'app
create table if not exists public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.app_admins enable row level security;
-- il primo account registrato diventa amministratore (solo se non ce n'è già uno)
insert into public.app_admins (user_id)
select id from auth.users
 where not exists (select 1 from public.app_admins)
 order by created_at limit 1
on conflict do nothing;

-- 2. numeri per l'amministratore; per tutti gli altri restituisce null
create or replace function public.admin_stats()
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  res jsonb;
begin
  if not exists (select 1 from public.app_admins where user_id = auth.uid()) then
    return null;
  end if;
  select jsonb_build_object(
    'users',    (select count(*) from auth.users),
    'active30', (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days'),
    'new7',     (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'tx',       (select count(*) from public.transactions),
    'db_bytes', pg_database_size(current_database()),
    'data_bytes', (select coalesce(sum(pg_total_relation_size(c.oid)), 0)
                     from pg_class c join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'public' and c.relkind = 'r'),
    'tables', (select coalesce(jsonb_agg(t order by (t ->> 'bytes')::bigint desc), '[]'::jsonb) from (
                 select jsonb_build_object('name', c.relname, 'bytes', pg_total_relation_size(c.oid),
                   'label', case c.relname
                     when 'transactions' then 'Movimenti' when 'categories' then 'Categorie'
                     when 'recurring' then 'Abbonamenti e periodici' when 'user_settings' then 'Impostazioni'
                     when 'transfers' then 'Trasferimenti' when 'accounts' then 'Conti'
                     when 'advances' then 'Anticipi' when 'advance_shares' then 'Quote degli anticipi'
                     when 'wishes' then 'Desideri' when 'budgets' then 'Budget'
                     else c.relname end) as t
                   from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relkind = 'r') x)
  ) into res;
  return res;
end;
$$;
revoke all on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;

-- 3. elimina l'account di chi la chiama e tutti i suoi dati.
--    Cancella da ogni tabella con la colonna user_id; ripete finché i collegamenti tra tabelle
--    (es. movimenti → conti) non lo permettono. Poi toglie l'utente da Supabase Auth.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  t record;
  left_over int;
  pass int := 0;
begin
  if uid is null then
    raise exception 'Non sei collegato';
  end if;
  loop
    pass := pass + 1;
    left_over := 0;
    for t in
      select c.table_name from information_schema.columns c
        join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
       where c.table_schema = 'public' and c.column_name = 'user_id' and tb.table_type = 'BASE TABLE'
         and c.table_name <> 'app_admins'
    loop
      begin
        execute format('delete from public.%I where user_id = $1', t.table_name) using uid;
      exception when foreign_key_violation then
        left_over := left_over + 1;
      end;
    end loop;
    exit when left_over = 0 or pass >= 6;
  end loop;
  if left_over > 0 then
    raise exception 'Alcuni dati non si possono eliminare: riprova o scrivimi';
  end if;
  delete from auth.users where id = uid;
end;
$$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
