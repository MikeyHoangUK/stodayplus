-- Adds cross-device cloud sync for the Notes & Materials feature in
-- dashboard.html. The feature already works locally via localStorage
-- without this -- run it in the Supabase SQL editor once to make it
-- also sync across devices (same pattern as quiz_session/org_topics).

alter table user_data add column if not exists question_notes jsonb;
alter table user_data add column if not exists topic_materials jsonb;
