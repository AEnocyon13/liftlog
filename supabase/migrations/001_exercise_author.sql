-- =====================================================================
-- 001 種目に「誰がいつ追加したか」を持たせる
--
-- アプリから種目を登録できるようにしたことに伴う追加。
-- schema.sql にも同じ定義を入れてあるので、新規に作る場合はこのファイルは不要。
-- すでに schema.sql を流したプロジェクトでは、これを SQL Editor で1回実行する。
-- 何度実行しても安全。
-- =====================================================================

alter table public.exercises
  add column if not exists created_by uuid references auth.users on delete set null;

alter table public.exercises
  add column if not exists created_at timestamptz not null default now();

-- 誰かが追加した種目を、本人以外が勝手に消せてしまわないようにする。
-- 一覧から隠す（active=false）のは全員できるが、行の削除は追加した本人だけ。
drop policy if exists exercises_write on public.exercises;
drop policy if exists exercises_insert on public.exercises;
drop policy if exists exercises_update on public.exercises;
drop policy if exists exercises_delete on public.exercises;

create policy exercises_insert on public.exercises for insert to authenticated
  with check (auth.uid() = created_by or created_by is null);
create policy exercises_update on public.exercises for update to authenticated
  using (true) with check (true);
create policy exercises_delete on public.exercises for delete to authenticated
  using (auth.uid() = created_by);

-- 解説も同様に、ログイン中なら書き足せる（既存のままだが念のため作り直す）
drop policy if exists guides_write on public.exercise_guides;
create policy guides_write on public.exercise_guides for all to authenticated
  using (true) with check (true);
