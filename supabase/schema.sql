-- =========================================================
--  Flunora — schema iniziale del database (0.0.1)
--  Riferimento: GIÀ ESEGUITO sul progetto Supabase. Non rieseguirlo.
--  Le modifiche successive sono in supabase/migrations/.
-- =========================================================

-- ---------- CATEGORIE ----------
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name        text not null,
  kind        text not null check (kind in ('entrata', 'uscita', 'investimento')),
  color       text not null default '#888888',
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),
  unique (user_id, kind, name)
);

-- ---------- MOVIMENTI RICORRENTI (modelli mensili) ----------
create table public.recurring (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade default auth.uid(),
  category_id   uuid not null references public.categories(id) on delete restrict,
  kind          text not null check (kind in ('entrata', 'uscita', 'investimento')),
  description   text not null,
  amount_cents  int  not null check (amount_cents > 0),   -- importi in centesimi: 1250 = 12,50 €
  day_of_month  int  not null default 1 check (day_of_month between 1 and 28),
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ---------- MOVIMENTI ----------
create table public.transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade default auth.uid(),
  date          date not null default current_date,      -- data della spesa (non dell'addebito)
  amount_cents  int  not null check (amount_cents > 0),
  kind          text not null check (kind in ('entrata', 'uscita', 'investimento')),
  category_id   uuid not null references public.categories(id) on delete restrict,
  description   text,
  recurring_id  uuid references public.recurring(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index transactions_user_date_idx on public.transactions (user_id, date);

-- Evita di generare due volte lo stesso ricorrente nello stesso mese
create unique index transactions_recurring_month_uq
  on public.transactions (recurring_id, date_trunc('month', date::timestamp))
  where recurring_id is not null;

-- ---------- SICUREZZA: ognuno vede solo i propri dati ----------
alter table public.categories   enable row level security;
alter table public.recurring    enable row level security;
alter table public.transactions enable row level security;

create policy "categorie proprie"   on public.categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "ricorrenti propri"   on public.recurring
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "movimenti propri"    on public.transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- VISTA: totali per mese (usata dalla dashboard) ----------
create view public.monthly_totals with (security_invoker = true) as
select
  user_id,
  date_trunc('month', date)::date                                   as month,
  coalesce(sum(amount_cents) filter (where kind = 'entrata'), 0)      as entrate_cents,
  coalesce(sum(amount_cents) filter (where kind = 'uscita'), 0)       as uscite_cents,
  coalesce(sum(amount_cents) filter (where kind = 'investimento'), 0) as investimenti_cents,
  coalesce(sum(amount_cents) filter (where kind = 'entrata'), 0)
    - coalesce(sum(amount_cents) filter (where kind = 'uscita'), 0)
    - coalesce(sum(amount_cents) filter (where kind = 'investimento'), 0) as saldo_cents
from public.transactions
group by user_id, date_trunc('month', date);

-- ---------- CATEGORIE INIZIALI: create in automatico alla registrazione ----------
create or replace function public.seed_default_categories()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.categories (user_id, name, kind, color, sort_order) values
    (new.id, 'Stipendio',    'entrata',      '#2E7D32', 1),
    (new.id, 'Compleanno',   'entrata',      '#66BB6A', 2),
    (new.id, 'Altro',        'entrata',      '#A5D6A7', 3),
    (new.id, 'Supermercato', 'uscita',       '#1E88E5', 1),
    (new.id, 'Benzina',      'uscita',       '#F4511E', 2),
    (new.id, 'Svago',        'uscita',       '#8E24AA', 3),
    (new.id, 'Casa',         'uscita',       '#00897B', 4),
    (new.id, 'Abbonamenti',  'uscita',       '#FDD835', 5),
    (new.id, 'Salute',       'uscita',       '#E53935', 6),
    (new.id, 'Altro',        'uscita',       '#757575', 7),
    (new.id, 'ETF',          'investimento', '#3949AB', 1),
    (new.id, 'Altro',        'investimento', '#9FA8DA', 2);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.seed_default_categories();
