-- The Stripe webhook (and later the admin page) use the service_role key.
-- These tables were created by SQL without grants for it, so the webhook got
-- "42501 permission denied" and Plus never unlocked (found 23 Oct 2026).
grant select, insert, update, delete on public.subscriptions to service_role;
grant select, insert, update, delete on public.question_reports to service_role;
