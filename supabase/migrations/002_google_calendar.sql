-- =====================================================================
-- 002 Google カレンダー連携
--
-- どのカレンダーに書くか（ユーザーごと）と、作成した予定のIDを覚えておく。
-- 予定IDを持っておくのは、記録を消したときに予定も消すため。
-- schema.sql にも同じ定義を入れてあるので、新規に作る場合はこのファイルは不要。
-- 何度実行しても安全。
-- =====================================================================

alter table public.profiles
  add column if not exists calendar_id text,
  add column if not exists calendar_summary text;

comment on column public.profiles.calendar_id is
  'Google カレンダーのID。null なら連携していない。';
comment on column public.profiles.calendar_summary is
  '選んだカレンダーの表示名。設定画面に出すためだけに持つ。';

alter table public.workouts
  add column if not exists calendar_event_id text;

comment on column public.workouts.calendar_event_id is
  '作成した Google カレンダーの予定ID。記録を消すときに予定も消すために使う。';

-- PostgREST のスキーマキャッシュを更新する。
-- これを忘れると、列を足したのに「Could not find the ... column」と言われ続ける。
notify pgrst, 'reload schema';
