-- Stoday Plus — founding families (first 50 at £5/month for life)
--
-- The stripe-webhook function records the price on each subscription and marks
-- £5 ones as founding. founding_places_left() lets anyone (even logged out, on
-- the landing page) see the REAL number of founding places left — it returns a
-- number only, never who subscribed. A place counts as taken once a founding
-- subscription has been paid for, even if it is later cancelled
-- ("the first 50 families").
--
-- Run once in Supabase → SQL editor (after subscriptions.sql). Safe to re-run.

alter table public.subscriptions add column if not exists price_id    text;
alter table public.subscriptions add column if not exists unit_amount int;     -- pence, e.g. 500 = £5
alter table public.subscriptions add column if not exists founding    boolean not null default false;

create or replace function public.founding_places_left()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select greatest(0, 50 - (
    select count(*) from public.subscriptions
    where founding and livemode  -- test-mode (sandbox) payments never take a real place
      and status not in ('incomplete', 'incomplete_expired')
  ))::int;
$$;

revoke all on function public.founding_places_left() from public;
grant execute on function public.founding_places_left() to anon, authenticated;
