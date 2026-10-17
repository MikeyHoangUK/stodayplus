-- Stoday Plus — demo.html MVP schema (Organiser + Poppy, new/separate accounts)
--
-- Scoped to its own tables (demo_*) so this doesn't touch or assume anything
-- about whatever schema the existing dashboard.html product already uses.
-- Run this once in the Supabase SQL editor for the project before building
-- demo.html against it. Reuses the same Supabase project as dashboard.html
-- (and its working ai-proxy edge function) -- no new project needed.

create table if not exists demo_topics (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  subject     text not null,
  topic_name  text not null,
  confidence  text not null default 'red' check (confidence in ('red','amber','green')),
  due_date    date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists demo_questions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  topic_id    uuid references demo_topics(id) on delete cascade,
  question    text not null,
  options     jsonb not null,       -- array of 5 option strings
  correct     int  not null,        -- 0-based index into options
  difficulty  text not null default 'medium' check (difficulty in ('easy','medium','hard')),
  hint        text,
  created_at  timestamptz not null default now()
);

create table if not exists demo_attempts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  question_id   uuid not null references demo_questions(id) on delete cascade,
  topic_id      uuid references demo_topics(id) on delete cascade,
  is_correct    boolean not null,
  answered_at   timestamptz not null default now()
);

create table if not exists demo_exams (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  exam_name   text not null,
  exam_date   date not null,
  created_at  timestamptz not null default now()
);

-- Added 2026-10-17: spaced-repetition fields (D1->D3->D7->D14->D28->D56->D84->D112,
-- +28/level after), so the Organiser can match dashboard.html's Revision Planner
-- (Today/Topics/Calendar tabs + review chain).
alter table demo_topics add column if not exists level int not null default 0;
alter table demo_topics add column if not exists cycle_start timestamptz not null default now();

-- Row Level Security: every user can only ever read/write their own rows.
alter table demo_topics    enable row level security;
alter table demo_questions enable row level security;
alter table demo_attempts  enable row level security;
alter table demo_exams     enable row level security;

create policy "own topics"    on demo_topics    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own questions" on demo_questions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own attempts"  on demo_attempts  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own exams"     on demo_exams     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists demo_topics_user_idx    on demo_topics(user_id);
create index if not exists demo_questions_topic_idx on demo_questions(topic_id);
create index if not exists demo_attempts_question_idx on demo_attempts(question_id);
create index if not exists demo_exams_user_idx on demo_exams(user_id);
