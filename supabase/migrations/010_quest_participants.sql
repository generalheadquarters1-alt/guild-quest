-- Reframe guild requests around request sheets and participant slots.
-- Existing challenger/successor columns are kept for backward compatibility.

alter table public.quests
  add column if not exists difficulty int not null default 3
    check (difficulty >= 1 and difficulty <= 5),
  add column if not exists estimated_minutes int,
  add column if not exists due_at timestamptz,
  add column if not exists required_members int not null default 1
    check (required_members >= 1 and required_members <= 3),
  add column if not exists participants text[] not null default '{}'::text[];

update public.quests q
set participants = coalesce(
  (
    select array_agg(name)
    from unnest(array[q.challenger, q.successor1, q.successor2]) as slots(name)
    where name is not null
      and btrim(name) <> ''
      and name <> '—'
  ),
  '{}'::text[]
)
where q.participants = '{}'::text[];

update public.quests
set required_members = case
  when status = 'succession_needed' then
    least(3, greatest(2, coalesce(array_length(participants, 1), 0) + 1))
  else
    least(3, greatest(1, coalesce(array_length(participants, 1), 1)))
end
where required_members = 1;

update public.quests
set difficulty = case level
  when 'Novice' then 1
  when 'Easy' then 2
  when 'Normal' then 3
  when 'Hard' then 4
  when 'Legend' then 5
  else difficulty
end;

update public.quests
set status = 'help_wanted'
where status = 'succession_needed';

create index if not exists quests_due_at_idx
  on public.quests (due_at);

create index if not exists quests_status_due_idx
  on public.quests (status, due_at);

create index if not exists quests_participants_gin_idx
  on public.quests using gin (participants);
