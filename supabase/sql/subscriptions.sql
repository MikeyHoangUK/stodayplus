-- Stoday Plus — Plus subscriptions (Stripe)
--
-- One row per account that has started a Stripe subscription. Only the
-- stripe-webhook edge function writes here (it uses the service role, which
-- bypasses RLS). Students can read their OWN row so the app knows whether to
-- unlock Plus; nobody can write from the browser.
--
-- Run once in Supabase → SQL editor. Safe to re-run.

create table if not exists public.subscriptions (
  user_id                 uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id      text,
  stripe_subscription_id  text unique,
  status                  text not null default 'incomplete',  -- Stripe status: active, trialing, past_due, canceled, unpaid, incomplete…
  current_period_end      timestamptz,
  cancel_at_period_end    boolean not null default false,
  livemode                boolean not null default false,       -- false = Stripe test mode
  updated_at              timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

-- Browser roles: read your own row only. No insert/update/delete.
revoke all on public.subscriptions from anon, authenticated;
grant select on public.subscriptions to authenticated;

drop policy if exists "read own subscription" on public.subscriptions;
create policy "read own subscription" on public.subscriptions
  for select to authenticated
  using (user_id = auth.uid());
