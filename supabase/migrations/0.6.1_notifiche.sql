-- =========================================================
--  Flunora 0.6.1 — NOTIFICHE SU IPHONE
--  Da eseguire DOPO aver creato la funzione "notifiche" (vedi la guida).
--
--  - push_subscriptions: i dispositivi iscritti alle notifiche (uno per iPhone)
--  - push_keys: le chiavi delle notifiche, create dalla funzione la prima volta;
--    nessuna regola di lettura: la vede solo la funzione su Supabase
--  - notify_log: cosa è già stato mandato, per non ripeterlo
--  - ogni ora (pg_cron) il database chiama la funzione "notifiche", che aggiunge
--    i periodici arrivati a scadenza e manda i promemoria
--
--  Si può rieseguire: crea solo ciò che manca e non cancella dati.
-- =========================================================

-- 1. dispositivi iscritti
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  device      text,
  created_at  timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
drop policy if exists "push: solo i propri" on public.push_subscriptions;
create policy "push: solo i propri" on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 2. chiavi delle notifiche (una riga sola) e segreto del giro di ogni ora
create table if not exists public.push_keys (
  id           int primary key default 1 check (id = 1),
  public_key   text,
  private_jwk  jsonb,
  cron_secret  text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at   timestamptz not null default now()
);
alter table public.push_keys enable row level security;   -- nessuna regola: dall'app non si legge
insert into public.push_keys (id) values (1) on conflict (id) do nothing;

-- l'app legge solo la chiave pubblica, che serve per iscrivere l'iPhone
create or replace function public.push_public_key()
returns text
language sql
stable
security definer
set search_path = public
as $$ select public_key from public.push_keys where id = 1 $$;
revoke all on function public.push_public_key() from public;
grant execute on function public.push_public_key() to authenticated;

-- 3. notifiche già mandate (una per tipo e periodo)
create table if not exists public.notify_log (
  user_id  uuid not null references auth.users (id) on delete cascade,
  kind     text not null,
  ref      text not null,
  sent_at  timestamptz not null default now(),
  primary key (user_id, kind, ref)
);
alter table public.notify_log enable row level security;  -- nessuna regola: la usa solo la funzione

-- 4. il giro di ogni ora: pg_cron chiama la funzione con pg_net
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
begin
  perform cron.unschedule('flunora-notifiche');
exception when others then null;   -- non c'era ancora
end $$;

select cron.schedule(
  'flunora-notifiche',
  '0 * * * *',
  $cmd$
    select net.http_post(
      url := 'https://ssvuusjiihydizzxtigt.supabase.co/functions/v1/notifiche',
      body := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-flunora-cron', (select cron_secret from public.push_keys where id = 1)),
      timeout_milliseconds := 60000)
  $cmd$
);

-- 5. prima chiamata subito: la funzione crea le chiavi delle notifiche
select net.http_post(
  url := 'https://ssvuusjiihydizzxtigt.supabase.co/functions/v1/notifiche',
  body := '{"init": true}'::jsonb,
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-flunora-cron', (select cron_secret from public.push_keys where id = 1)),
  timeout_milliseconds := 60000);

-- Controllo (facoltativo), dopo qualche secondo:
--   select public_key is not null as chiavi_pronte from public.push_keys;
--   select jobname, schedule from cron.job where jobname = 'flunora-notifiche';
