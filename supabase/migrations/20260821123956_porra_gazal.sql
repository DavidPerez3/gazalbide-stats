create table if not exists public.porra_rounds (
  id uuid primary key default gen_random_uuid(),
  season text not null,
  round_number integer not null check (round_number > 0),
  title text not null,
  deadline_at timestamptz not null,
  prize_text text,
  status text not null default 'draft' check (status in ('draft','open','scored','cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season, round_number)
);

create table if not exists public.porra_questions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.porra_rounds(id) on delete cascade,
  position smallint not null check (position > 0),
  prompt text not null,
  kind text not null check (kind in ('choice','number')),
  options jsonb not null default '[]'::jsonb,
  points_exact integer not null default 3 check (points_exact >= 0),
  points_near_1 integer not null default 0 check (points_near_1 >= 0),
  points_near_3 integer not null default 0 check (points_near_3 >= 0),
  created_at timestamptz not null default now(),
  unique (round_id, position),
  constraint porra_choice_options check (
    (kind = 'number' and jsonb_typeof(options) = 'array')
    or
    (kind = 'choice' and jsonb_typeof(options) = 'array' and jsonb_array_length(options) >= 2)
  )
);

create table if not exists public.porra_question_results (
  question_id uuid primary key references public.porra_questions(id) on delete cascade,
  correct_answer text not null,
  set_by uuid references auth.users(id) on delete set null,
  set_at timestamptz not null default now()
);

create table if not exists public.porra_predictions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.porra_rounds(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  total_points integer,
  score_breakdown jsonb,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (round_id, user_id)
);

create index if not exists porra_rounds_status_deadline_idx on public.porra_rounds(status, deadline_at);
create index if not exists porra_questions_round_idx on public.porra_questions(round_id, position);
create index if not exists porra_predictions_round_idx on public.porra_predictions(round_id);
create index if not exists porra_predictions_user_idx on public.porra_predictions(user_id);

create or replace function public.porra_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists porra_rounds_touch_updated_at on public.porra_rounds;
create trigger porra_rounds_touch_updated_at
before update on public.porra_rounds
for each row execute function public.porra_touch_updated_at();

drop trigger if exists porra_predictions_touch_updated_at on public.porra_predictions;
create trigger porra_predictions_touch_updated_at
before update on public.porra_predictions
for each row execute function public.porra_touch_updated_at();

alter table public.porra_rounds enable row level security;
alter table public.porra_questions enable row level security;
alter table public.porra_question_results enable row level security;
alter table public.porra_predictions enable row level security;

drop policy if exists "Porra visible rounds" on public.porra_rounds;
create policy "Porra visible rounds" on public.porra_rounds for select to authenticated
using (status in ('open','scored') or public.is_gazal_admin());

drop policy if exists "Porra admin rounds" on public.porra_rounds;
create policy "Porra admin rounds" on public.porra_rounds for all to authenticated
using (public.is_gazal_admin()) with check (public.is_gazal_admin());

drop policy if exists "Porra visible questions" on public.porra_questions;
create policy "Porra visible questions" on public.porra_questions for select to authenticated
using (exists (select 1 from public.porra_rounds r where r.id = porra_questions.round_id and (r.status in ('open','scored') or public.is_gazal_admin())));

drop policy if exists "Porra admin questions" on public.porra_questions;
create policy "Porra admin questions" on public.porra_questions for all to authenticated
using (public.is_gazal_admin()) with check (public.is_gazal_admin());

drop policy if exists "Porra visible results" on public.porra_question_results;
create policy "Porra visible results" on public.porra_question_results for select to authenticated
using (public.is_gazal_admin() or exists (
  select 1 from public.porra_questions q join public.porra_rounds r on r.id = q.round_id
  where q.id = porra_question_results.question_id and r.status = 'scored'
));

drop policy if exists "Porra admin results" on public.porra_question_results;
create policy "Porra admin results" on public.porra_question_results for all to authenticated
using (public.is_gazal_admin()) with check (public.is_gazal_admin());

drop policy if exists "Porra predictions select" on public.porra_predictions;
create policy "Porra predictions select" on public.porra_predictions for select to authenticated
using (user_id = auth.uid() or public.is_gazal_admin() or exists (
  select 1 from public.porra_rounds r where r.id = porra_predictions.round_id and r.status = 'scored'
));

drop policy if exists "Porra predictions insert" on public.porra_predictions;
create policy "Porra predictions insert" on public.porra_predictions for insert to authenticated
with check (user_id = auth.uid() and exists (
  select 1 from public.porra_rounds r where r.id = porra_predictions.round_id and r.status = 'open' and now() < r.deadline_at
));

drop policy if exists "Porra predictions update" on public.porra_predictions;
create policy "Porra predictions update" on public.porra_predictions for update to authenticated
using (user_id = auth.uid() and exists (
  select 1 from public.porra_rounds r where r.id = porra_predictions.round_id and r.status = 'open' and now() < r.deadline_at
))
with check (user_id = auth.uid() and exists (
  select 1 from public.porra_rounds r where r.id = porra_predictions.round_id and r.status = 'open' and now() < r.deadline_at
));

drop policy if exists "Porra admin predictions" on public.porra_predictions;
create policy "Porra admin predictions" on public.porra_predictions for all to authenticated
using (public.is_gazal_admin()) with check (public.is_gazal_admin());

create or replace function public.score_porra_round(p_round_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_round public.porra_rounds%rowtype;
  v_missing integer;
  v_prediction public.porra_predictions%rowtype;
  v_question public.porra_questions%rowtype;
  v_correct text;
  v_answer text;
  v_points integer;
  v_total integer;
  v_delta numeric;
  v_breakdown jsonb;
  v_scored integer := 0;
begin
  if auth.uid() is null or not public.is_gazal_admin() then raise exception 'Admin required'; end if;
  select * into v_round from public.porra_rounds where id = p_round_id for update;
  if not found then raise exception 'Porra round not found'; end if;
  if v_round.status = 'draft' then raise exception 'Publish the round before scoring'; end if;
  if now() < v_round.deadline_at then raise exception 'Deadline has not passed'; end if;

  select count(*) into v_missing
  from public.porra_questions q left join public.porra_question_results qr on qr.question_id = q.id
  where q.round_id = p_round_id and qr.question_id is null;
  if v_missing > 0 then raise exception 'Missing correct answers'; end if;

  for v_prediction in select * from public.porra_predictions where round_id = p_round_id for update loop
    v_total := 0;
    v_breakdown := '{}'::jsonb;
    for v_question in select * from public.porra_questions where round_id = p_round_id order by position loop
      select correct_answer into v_correct from public.porra_question_results where question_id = v_question.id;
      v_answer := v_prediction.answers ->> v_question.id::text;
      v_points := 0;
      if v_answer is not null then
        if v_question.kind = 'choice' then
          if lower(trim(v_answer)) = lower(trim(v_correct)) then v_points := v_question.points_exact; end if;
        else
          begin
            v_delta := abs(v_answer::numeric - v_correct::numeric);
            if v_delta = 0 then v_points := v_question.points_exact;
            elsif v_delta <= 1 then v_points := v_question.points_near_1;
            elsif v_delta <= 3 then v_points := v_question.points_near_3;
            end if;
          exception when invalid_text_representation then v_points := 0;
          end;
        end if;
      end if;
      v_total := v_total + v_points;
      v_breakdown := v_breakdown || jsonb_build_object(v_question.id::text, v_points);
    end loop;
    update public.porra_predictions set total_points = v_total, score_breakdown = v_breakdown where id = v_prediction.id;
    v_scored := v_scored + 1;
  end loop;
  update public.porra_rounds set status = 'scored' where id = p_round_id;
  return jsonb_build_object('round_id', p_round_id, 'predictions_scored', v_scored);
end;
$$;

grant select on public.porra_rounds, public.porra_questions, public.porra_question_results, public.porra_predictions to authenticated;
grant insert, update on public.porra_predictions to authenticated;
grant insert, update, delete on public.porra_rounds, public.porra_questions, public.porra_question_results to authenticated;
grant execute on function public.score_porra_round(uuid) to authenticated;
revoke all on function public.score_porra_round(uuid) from anon;
