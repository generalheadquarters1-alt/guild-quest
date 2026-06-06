-- Adventurer avatar selection.
-- Safe default keeps existing staff rows usable.

alter table public.staff
  add column if not exists avatar_type text not null default 'male';

update public.staff
set avatar_type = case
    when name in ('鈴木', '高橋') then 'female'
    else coalesce(nullif(avatar_type, ''), 'male')
  end
where avatar_type is null
   or avatar_type = ''
   or name in ('鈴木', '高橋');
