-- Guild Quest scoring + cooperative player growth.
-- Safe defaults preserve existing quest and staff rows.

alter table public.quests
  add column if not exists urgency int not null default 3 check (urgency >= 1 and urgency <= 5),
  add column if not exists importance int not null default 3 check (importance >= 1 and importance <= 5);

alter table public.staff
  add column if not exists level int not null default 1,
  add column if not exists exp int not null default 0,
  add column if not exists title text not null default '見習い冒険者',
  add column if not exists avatar_frame text not null default 'bronze';

update public.staff
set level = floor(exp / 100)::int + 1
where level is null or level < 1;

update public.quests
set urgency = case title
    when 'メダル補充と貸出機まわり確認' then 5
    when '週末イベントPOPの差し替え' then 4
    when '開店前の景品棚フェイスアップ' then 4
    when '閉店前の忘れ物チェック' then 3
    when '故障中POPの回収漏れ確認' then 3
    when 'レジ横消耗品の在庫確認' then 2
    else urgency
  end,
  importance = case title
    when 'メダル補充と貸出機まわり確認' then 5
    when '週末イベントPOPの差し替え' then 4
    when '開店前の景品棚フェイスアップ' then 4
    when '閉店前の忘れ物チェック' then 3
    when '故障中POPの回収漏れ確認' then 4
    when 'レジ横消耗品の在庫確認' then 2
    else importance
  end
where title in (
  'メダル補充と貸出機まわり確認',
  '週末イベントPOPの差し替え',
  '開店前の景品棚フェイスアップ',
  '閉店前の忘れ物チェック',
  '故障中POPの回収漏れ確認',
  'レジ横消耗品の在庫確認'
);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'staff'
  ) then
    alter publication supabase_realtime add table public.staff;
  end if;
end $$;
