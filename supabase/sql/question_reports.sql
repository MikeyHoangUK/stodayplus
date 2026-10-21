-- Stoday Plus — "Report this question" (Poppy, dashboard.html)
--
-- Students tap "Report this question" after answering; the app inserts one row
-- here. Students can ONLY insert their own rows. Nobody can read, change or
-- delete rows from the browser — Mikey reads them in the Supabase dashboard
-- (Table editor) or, later, the admin page via an edge function using the
-- service role (which bypasses RLS). See Projects/Stoday Plus - Admin Page Plan.
--
-- Run once in Supabase → SQL editor. Safe to re-run.
-- Until this runs, the app keeps reports in localStorage (sp_report_queue)
-- and sends them automatically on a later visit.

create table if not exists public.question_reports (
  id            bigint generated always as identity primary key,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  user_email    text,
  question_id   text not null,
  question_src  text not null check (question_src in ('aqa', 'own')),
  folder        text,
  stem          text check (char_length(stem) <= 2000),   -- question text when reported
  options       jsonb,                                     -- answer options when reported
  chosen        int,                                       -- 0-based option the student picked
  correct       int,                                       -- 0-based correct option at the time
  reason        text not null check (reason in ('wrong_answer', 'unclear', 'typo', 'other')),
  note          text check (char_length(note) <= 300),
  status        text not null default 'open' check (status in ('open', 'fixed', 'dismissed')),
  created_at    timestamptz not null default now()
);

create index if not exists question_reports_open_idx
  on public.question_reports (status, created_at desc);
create index if not exists question_reports_question_idx
  on public.question_reports (question_src, question_id);

alter table public.question_reports enable row level security;

-- Browser roles: insert only. No select/update/delete grants at all.
revoke all on public.question_reports from anon, authenticated;
grant insert on public.question_reports to authenticated;

drop policy if exists "Students insert their own reports" on public.question_reports;
create policy "Students insert their own reports"
  on public.question_reports
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and status = 'open'
    and (user_email is null or user_email = (auth.jwt() ->> 'email'))
  );

-- No SELECT / UPDATE / DELETE policies on purpose: only the service role
-- (Supabase dashboard, edge functions) can read or change reports.
