-- Keep the original requester separate from the current task owner.

alter table public.adventurer_tasks
  add column if not exists original_owner_name text;

update public.adventurer_tasks
set original_owner_name = owner_name
where original_owner_name is null;

create index if not exists adventurer_tasks_original_owner_idx
  on public.adventurer_tasks (original_owner_name);
