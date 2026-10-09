-- =====================================================================
-- LiftLog — Supabase スキーマ
--
-- Supabase ダッシュボードの SQL Editor に貼り付けて実行する。
-- 何度実行しても同じ状態になる（既存のテーブル・ポリシーは作り直す）。
--
-- 設計の前提
--   ・ブラウザは anon キーで直接 Supabase に接続する。anon キーは公開前提の鍵なので、
--     「誰が何をできるか」は下の RLS ポリシーだけで決まる。
--   ・閲覧（覗き見）は誰でもできる。書き込みは本人（auth.uid() 一致）だけ。
--   ・メールアドレスは本人しか読めない user_private に置く。
--     profiles は公開テーブルなので、個人を特定できる情報を入れないこと。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. プロフィール（公開）
--    ログイン画面の名前一覧に使う。auth_email は Supabase Auth 用の
--    合成アドレスで、実在しない。本物のメールは user_private に入れる。
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id                      uuid primary key references auth.users on delete cascade,
  display_name            text not null unique check (length(btrim(display_name)) between 1 and 40),
  auth_email              text not null unique,
  weight_increment        numeric(5,2) not null default 2.5  check (weight_increment > 0),
  rest_minutes            int          not null default 3    check (rest_minutes between 1 and 15),
  monthly_target_workouts int          not null default 12   check (monthly_target_workouts between 1 and 31),
  monthly_target_volume   numeric      not null default 0    check (monthly_target_volume >= 0),
  created_at              timestamptz  not null default now(),
  last_login_at           timestamptz
);

comment on table  public.profiles is 'ログイン画面に出す公開プロフィール。個人を特定できる情報は入れない。';
comment on column public.profiles.auth_email is 'Supabase Auth 用の合成アドレス（実在しない）。本物のメールは user_private。';

-- ---------------------------------------------------------------------
-- 2. 非公開の個人情報（本人のみ）
--    いまはメールアドレスだけ。将来の Google カレンダー連携で使う。
-- ---------------------------------------------------------------------
create table if not exists public.user_private (
  id         uuid primary key references auth.users on delete cascade,
  email      text,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. 種目マスター（全員共通）
-- ---------------------------------------------------------------------
create table if not exists public.exercises (
  id           bigint generated always as identity primary key,
  part         text not null,
  name         text not null,
  equipment    text,
  rep_min      int     not null default 8,
  rep_max      int     not null default 12,
  default_sets int     not null default 3,
  sort_order   int     not null default 999,
  part_order   int     not null default 999,
  active       boolean not null default true,
  unique (part, name)
);

-- ---------------------------------------------------------------------
-- 4. 種目解説（Notion から取り込んだ内容）
-- ---------------------------------------------------------------------
create table if not exists public.exercise_guides (
  exercise_id    bigint primary key references public.exercises on delete cascade,
  description    text,
  muscles        text[] not null default '{}',
  assist_muscles text[] not null default '{}',
  points         text[] not null default '{}',
  cautions       text[] not null default '{}',
  videos         jsonb  not null default '[]',   -- [{title, url, videoId}]
  tags           text[] not null default '{}',
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 5. ワークアウト（1行 = 1セッション）
--    status='active' の行が「実施中」。draft に入力途中の内容を
--    丸ごと入れて自動保存するので、端末が変わっても続きから再開できる。
-- ---------------------------------------------------------------------
create table if not exists public.workouts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  date         date not null,
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,
  status       text not null default 'active' check (status in ('active','finished')),
  rest_minutes int,
  memo         text,
  draft        jsonb,
  total_sets   int,
  total_volume numeric,
  duration_min int,
  updated_at   timestamptz not null default now()
);

-- 実施中のワークアウトは1人1件まで（置き忘れを防ぐ）
create unique index if not exists workouts_one_active_per_user
  on public.workouts (user_id) where status = 'active';

create index if not exists workouts_user_date_idx on public.workouts (user_id, date desc);

-- ---------------------------------------------------------------------
-- 6. セット（1行 = 1セット）
--    volume と est_1rm は保存時に自動計算する。
-- ---------------------------------------------------------------------
create table if not exists public.workout_sets (
  id          bigint generated always as identity primary key,
  workout_id  uuid not null references public.workouts on delete cascade,
  user_id     uuid not null references auth.users on delete cascade,
  date        date not null,
  part        text not null,
  exercise    text not null,
  set_no      int  not null,
  weight      numeric(6,2) not null default 0,
  reps        int  not null check (reps > 0),
  rpe         numeric(3,1),
  is_warmup   boolean not null default false,
  memo        text,
  volume      numeric generated always as
                (case when is_warmup then 0 else weight * reps end) stored,
  est_1rm     numeric generated always as
                (case when is_warmup then null
                      else round(weight * (1 + reps::numeric / 30), 1) end) stored,
  created_at  timestamptz not null default now()
);

create index if not exists workout_sets_user_exercise_idx
  on public.workout_sets (user_id, part, exercise, date desc, set_no);
create index if not exists workout_sets_user_date_idx
  on public.workout_sets (user_id, date);
create index if not exists workout_sets_workout_idx
  on public.workout_sets (workout_id);

-- ---------------------------------------------------------------------
-- 7. updated_at の自動更新
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists workouts_touch on public.workouts;
create trigger workouts_touch before update on public.workouts
  for each row execute function public.touch_updated_at();

drop trigger if exists user_private_touch on public.user_private;
create trigger user_private_touch before update on public.user_private
  for each row execute function public.touch_updated_at();

-- =====================================================================
-- RLS（行単位の権限制御）
--
--   閲覧 … 誰でも可（覗き見モードのため）。ただし user_private だけは本人のみ。
--   更新 … 本人のみ。UIを迂回して直接APIを叩いても、ここで弾かれる。
-- =====================================================================
alter table public.profiles        enable row level security;
alter table public.user_private    enable row level security;
alter table public.exercises       enable row level security;
alter table public.exercise_guides enable row level security;
alter table public.workouts        enable row level security;
alter table public.workout_sets    enable row level security;

-- profiles: 誰でも読める / 自分の行だけ作成・更新できる
drop policy if exists profiles_read   on public.profiles;
drop policy if exists profiles_insert on public.profiles;
drop policy if exists profiles_update on public.profiles;
create policy profiles_read   on public.profiles for select using (true);
create policy profiles_insert on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy profiles_update on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

-- user_private: 本人のみ（読み取りも本人だけ）
drop policy if exists user_private_all on public.user_private;
create policy user_private_all on public.user_private for all to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

-- 種目マスターと解説: 誰でも読める / 変更はログイン中のユーザーなら可
drop policy if exists exercises_read  on public.exercises;
drop policy if exists exercises_write on public.exercises;
create policy exercises_read  on public.exercises for select using (true);
create policy exercises_write on public.exercises for all to authenticated
  using (true) with check (true);

drop policy if exists guides_read  on public.exercise_guides;
drop policy if exists guides_write on public.exercise_guides;
create policy guides_read  on public.exercise_guides for select using (true);
create policy guides_write on public.exercise_guides for all to authenticated
  using (true) with check (true);

-- ワークアウトとセット: 誰でも読める（覗き見） / 書けるのは本人だけ
drop policy if exists workouts_read   on public.workouts;
drop policy if exists workouts_insert on public.workouts;
drop policy if exists workouts_update on public.workouts;
drop policy if exists workouts_delete on public.workouts;
create policy workouts_read   on public.workouts for select using (true);
create policy workouts_insert on public.workouts for insert to authenticated with check (auth.uid() = user_id);
create policy workouts_update on public.workouts for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy workouts_delete on public.workouts for delete to authenticated using (auth.uid() = user_id);

drop policy if exists sets_read   on public.workout_sets;
drop policy if exists sets_insert on public.workout_sets;
drop policy if exists sets_update on public.workout_sets;
drop policy if exists sets_delete on public.workout_sets;
create policy sets_read   on public.workout_sets for select using (true);
create policy sets_insert on public.workout_sets for insert to authenticated with check (auth.uid() = user_id);
create policy sets_update on public.workout_sets for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy sets_delete on public.workout_sets for delete to authenticated using (auth.uid() = user_id);

-- =====================================================================
-- 集計用のビュー（月間レポートで使う）
-- =====================================================================
create or replace view public.v_daily_volume
with (security_invoker = true) as
  select user_id, date,
         sum(volume)                 as volume,
         count(*) filter (where not is_warmup) as sets,
         array_agg(distinct part)    as parts
  from public.workout_sets
  where not is_warmup
  group by user_id, date;

-- 種目ごと・月ごとのベスト（自己ベスト更新の判定に使う）
create or replace view public.v_exercise_monthly_best
with (security_invoker = true) as
  select user_id, part, exercise,
         date_trunc('month', date)::date as month,
         max(est_1rm) as best_est_1rm,
         max(weight)  as best_weight
  from public.workout_sets
  where not is_warmup
  group by user_id, part, exercise, date_trunc('month', date);

create or replace view public.v_exercise_best
with (security_invoker = true) as
  select user_id, part, exercise,
         max(est_1rm) as best_est_1rm,
         max(date)    as last_date
  from public.workout_sets
  where not is_warmup
  group by user_id, part, exercise;
