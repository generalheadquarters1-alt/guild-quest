-- RPG growth stats and expedition result rolls.
-- Safe additive migration for existing Guild Quest projects.

alter table public.player_resources
  add column if not exists morale int not null default 70,
  add column if not exists fatigue int not null default 0,
  add column if not exists proficiency int not null default 0,
  add column if not exists trust int not null default 0,
  add column if not exists equipment_key text not null default 'wooden_sword',
  add column if not exists equipment_durability int not null default 100,
  add column if not exists job_class text not null default 'novice',
  add column if not exists last_trained_at timestamptz,
  add column if not exists total_expedition_success int not null default 0,
  add column if not exists total_expedition_failure int not null default 0;

update public.player_resources
set
  morale = least(100, greatest(0, morale)),
  fatigue = least(100, greatest(0, fatigue)),
  proficiency = least(100, greatest(0, proficiency)),
  trust = least(100, greatest(0, trust)),
  equipment_durability = least(100, greatest(0, equipment_durability)),
  equipment_key = coalesce(nullif(equipment_key, ''), 'wooden_sword'),
  job_class = coalesce(nullif(job_class, ''), 'novice'),
  total_expedition_success = greatest(0, total_expedition_success),
  total_expedition_failure = greatest(0, total_expedition_failure);

alter table public.expeditions
  add column if not exists result text,
  add column if not exists success_rate int,
  add column if not exists result_message text,
  add column if not exists reward_materials jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'expeditions_result_check'
  ) then
    alter table public.expeditions
      add constraint expeditions_result_check
      check (result is null or result in ('success', 'failure'));
  end if;
end $$;

create index if not exists expeditions_result_idx
  on public.expeditions (player_name, result, claimed_at desc);

