# ギルドクエスト

職場の作業を「冒険者手帳の任務」として記録し、必要なものだけをギルド依頼に変換する、プレイヤー向け共有ギルドボードです。
主な利用想定は、アミューズメント店舗・小売店舗・現場運営チームの当日作業共有です。

基本フロー:

1. 冒険者手帳に任務を記録します。
2. 納期がある任務はギルド暦へ期限予定として登録されます。
3. 他者へ任せたい任務だけ「任務を依頼書化」から依頼書設定を行います。
4. 依頼書化された任務がギルド依頼として掲示板に出ます。
5. 参加・助っ人募集・達成すると、親任務も完了同期され、EXPや遠征チケットを獲得します。

## 技術構成

- React 19 + TypeScript + Vite
- Tailwind CSS 4
- Supabase (Postgres + Realtime)
- Vercel deployment ready

## Supabaseセットアップ

1. [Supabase](https://supabase.com)で新規プロジェクトを作成します。
2. SQL Editorでマイグレーションを順番に実行します。
   - `supabase/migrations/001_quests.sql`
   - `supabase/migrations/002_staff_and_logs.sql`
   - 任意: `supabase/migrations/003_sample_store_quests.sql`
   - `supabase/migrations/004_guild_growth_scores.sql`
   - `supabase/migrations/005_staff_avatar_type.sql`
   - `supabase/migrations/006_expeditions.sql`
   - `supabase/migrations/007_calendar_events.sql`
   - `supabase/migrations/008_adventurer_tasks.sql`
   - `supabase/migrations/009_guild_operations.sql`
   - `supabase/migrations/010_quest_participants.sql`
3. `quests` と `quest_logs` がRealtime対象になっていることを確認します。
   - マイグレーション内で `alter publication supabase_realtime add table ...` を実行しています。
4. Project Settings → API から以下を控えます。
   - Project URL
   - anon public key

## ローカル起動

```bash
npm install
cp .env.example .env
```

`.env` を編集します。

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbG...
VITE_GUILD_CODE=店舗で共有する合言葉
```

起動します。

```bash
npm run dev
```

通常は `http://localhost:5173` で開きます。

## Vercelデプロイ

1. GitHubにリポジトリをpushします。
2. Vercelで「New Project」からこのリポジトリをImportします。
3. Framework Presetは `Vite` を選択します。
4. Environment Variablesに以下を設定します。
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_GUILD_CODE`
5. Build Commandは通常 `npm run build`、Output Directoryは `dist` です。
6. Deploy後、実URLで任務作成・依頼書設定・参加・達成・Realtime反映を確認します。

## 初回利用フロー

1. Vercel URLまたはローカルURLを開きます。
2. 「ギルドへの入場」画面で合言葉を入力します。
3. 冒険者名を入力します。
4. 男勇者または女勇者のアバターを選択します。
5. 合言葉が正しければ、冒険者名とアバターが `staff` テーブルに登録されます。
6. 同じ名前が既に `staff` にある場合は重複登録せず、その冒険者として入場します。
7. 次回以降、同じ端末では合言葉と冒険者名の入力なしで自動入場します。

保存に使う `localStorage`:

- `guild_quest_access_granted`
- `guild_quest_player_name`
- `guild_quest_avatar`

設定画面から「冒険者名を変更」または「ギルドから退出」ができます。退出しても `staff` テーブルから冒険者は削除されません。

## ギルドコードについて

ギルドコードは簡易的な入場制限です。URLとギルドコードを知っている人は利用できます。  
本格的な権限管理や個人認証が必要な運用では、Supabase Authなどの導入を検討してください。

## staffテーブル編集

プレイヤー表示は `public.staff` テーブルから読み込みます。

| Column | 用途 |
| --- | --- |
| `name` | アプリ上の表示名。クエスト担当者名として保存されます。 |
| `role` | 役割表示。例: フロア担当、カウンター、社員 |
| `avatar` | 1文字アイコン。例: ⚔️、📜、🛡️ |
| `hp` / `mp` | 0-100の表示用ゲージ。実績計算には未使用です。 |
| `status` | `ready`, `busy`, `resting` のいずれか。 |
| `role_level` | `adventurer`, `sub_master`, `guild_master` のいずれか。 |
| `sort_order` | パーティ一覧の表示順。 |

編集方法:

1. Supabase Table Editorで `staff` を開きます。
2. 店舗の実スタッフ名または運用上の表示名に置き換えます。
3. `name` はクエストの担当者照合に使うため、運用開始後は頻繁に変更しないでください。
4. 退職・異動時は削除よりも、名前を残したまま `status = resting` にする運用が安全です。

## サンプルクエスト

`003_sample_store_quests.sql` は、アミューズメント・小売店舗向けのサンプルです。

含まれる例:

- 開店前の景品棚フェイスアップ
- メダル補充と貸出機まわり確認
- 閉店前の忘れ物チェック
- 週末イベントPOPの差し替え
- レジ横消耗品の在庫確認
- 故障中POPの回収漏れ確認

本番データに混ぜたくない場合は、ローカル検証またはデモ用Supabaseプロジェクトでのみ実行してください。

## 冒険者手帳

冒険者手帳は、ギルドクエストの中心となる個人任務管理画面です。ログイン後の最初の画面は「本日の任務」です。

できること:

- 今日、今週、今月、未来の任務確認
- 任務名、説明、緊急度、重要度、納期、公開設定、関連予定の登録
- 納期付き任務のギルド暦「任務」欄への自動表示
- 任務カードから「任務を依頼書化」で依頼書設定を開き、ギルド依頼を生成
- 任務完了によるEXPと遠征チケット獲得
- クエスト達成時の親任務自動完了

PC版では左メニューの「冒険者手帳」から開けます。スマホ版では下部ナビの「手帳」から開けます。

冒険者手帳を使うには `supabase/migrations/008_adventurer_tasks.sql` を実行してください。
このテーブルも現在のデモ方針に合わせ、匿名読み書きを許可しています。本格運用ではSupabase Auth等による権限管理を検討してください。

## ギルド速報・助言・指名依頼・ギルド指令

ギルド運営機能は、他人の任務へ勝手に介入しないために「提案→承認」を基本にしています。

4段階:

1. ギルド警報: 納期切れ、期限間近などを「ギルド速報」に表示します。
2. 助言: 任務カードから別の冒険者へ提案できます。相手が承認すると手帳に追加されます。
3. 指名依頼: 相手が承認すると手帳に追加され、依頼書化されてクエストになります。
4. ギルド指令: `sub_master` / `guild_master` のみ発令できます。承認不要で対象者の手帳へ追加されます。

PC版では左メニューの「ギルド速報」から確認できます。スマホ版では「ギルド」画面の「ギルド速報」導線から開けます。

ロール:

| `role_level` | 権限 |
| --- | --- |
| `adventurer` | 通常ユーザー。助言と指名依頼を送れます。 |
| `sub_master` | ギルド指令を発令できます。 |
| `guild_master` | ギルド指令を発令できます。 |

ギルド運営機能を使うには `supabase/migrations/009_guild_operations.sql` を実行してください。
この機能も現在のデモ方針に合わせ、匿名読み書きを許可しています。本格運用ではSupabase Auth等による権限管理を検討してください。

## 遠征

遠征は、クエスト達成後も定期的にアプリを開きたくなる簡易放置ゲーム要素です。

基本ループ:

1. 任務を完了、またはクエストを討伐完了します。
2. 遠征チケットを獲得します。
3. PC版は左メニューの「遠征」、スマホ版は「自分」タブ内の遠征セクションを開きます。
4. 遠征先を選んで「出発」します。
5. 所要時間が経過したら「報酬を受け取る」でEXP、GOLD、アイテム、ギルドEXPを獲得します。

遠征チケットはクエスト達成時に付与されます。

| 依頼ランク | 獲得チケット |
| --- | --- |
| 25以上 | 3 |
| 15以上 | 2 |
| 14以下 | 1 |

遠征機能を使うには `supabase/migrations/006_expeditions.sql` を実行してください。
遠征テーブルも現在のデモ方針に合わせ、匿名読み書きを許可しています。本格運用ではSupabase Auth等による権限管理を検討してください。

## ギルド暦

ギルド暦は、店舗・職場の予定と任務の納期を同じ日付上で確認するための画面です。予定と任務は同じリストに混ぜず、「ギルド予定」「公開任務」「自分の任務」に分けて表示します。

できること:

- 月表示で予定と表示可能な任務を確認
- 今日へ戻る、前月/次月への移動
- 日別のギルド予定、公開任務、自分の任務の確認
- 今日から7日間の「今週の予定と任務」確認
- ギルド予定、個人予定、シフト、期限、メモの登録
- 重要度1-5による強調表示
- ギルド予定と関連任務・関連依頼の確認

表示ルール:

- 予定は `calendar_events` に登録された全体共有情報です。
- 任務は `adventurer_tasks` の個人タスクです。
- 他人の任務は `is_public = true` のものだけ表示します。
- 自分の任務は公開/非公開に関係なく「自分の任務」に表示します。
- `due_date` がない任務はギルド暦には出さず、冒険者手帳内で扱います。

PC版では左メニューの「ギルド暦」から開けます。スマホ版では下部ナビの「暦」から開けます。

ギルド暦を使うには `supabase/migrations/007_calendar_events.sql` を実行してください。
この機能も現在のデモ方針に合わせ、匿名読み書きを許可しています。本格運用ではSupabase Auth等による権限管理を検討してください。

## パイロット運用ルール

最初の1-2週間は、以下のルールで小さく始めるのがおすすめです。

1. まず個人作業を冒険者手帳へ任務として登録します。
2. 他者へ任せたいものだけ「任務を依頼書化」で依頼タイトル、難易度、推定時間、納期、必要人員を設定します。
3. ギルド依頼は必要人員制です。参加人数が必要人員に達すると「挑戦中」になります。
4. 人手が足りない場合、参加メンバーは「助っ人募集」を出します。
5. 定員に達している依頼へ追加参加はできません。
6. 達成時は、必要ならギルドの記録で後から追える短い理由を残します。
7. 1日の終わりに、本日の任務・未受注・募集中・助っ人募集・挑戦中を確認します。
8. 他人の作業に気付いた場合は、まず「助言する」を使います。
9. 任せたい場合は「指名依頼」を使い、相手の承認を待ちます。
10. ギルド指令は管理者だけが使い、棚卸しや緊急対応など承認待ちにできないものに限定します。
11. スタッフへの説明では「評価」ではなく「見落とし防止」として運用します。

## データモデル

### `quests`

冒険者手帳の任務から生成されるギルド依頼です。新規作成は直接行わず、任務の「任務を依頼書化」から依頼書設定を通して生成します。

| Column | Notes |
| --- | --- |
| `id` | 自動採番 |
| `status` | `open`, `recruiting`, `help_wanted`, `in_progress`, `completed` |
| `difficulty` | 1-5。表示は `Lv 見習い`, `Lv 易`, `Lv 標準`, `Lv 難`, `Lv 伝説`。 |
| `estimated_minutes` | 推定時間。15分、30分、1時間、2時間、3時間、半日、終日。 |
| `due_at` | 納期日時。期限超過表示に使用。 |
| `required_members` | 必要人員。1-3。 |
| `participants` | 参加メンバー名の配列。 |
| `priority` | 旧互換用。新UIでは表示しません。 |
| `urgency` | 1-5。緊急度。 |
| `importance` | 1-5。重要度。 |
| `completed_at` | 達成時に設定、再掲時にクリア |
| `linked_event_id` | 関連するギルド暦予定。任意。 |

状態遷移:

1. `open`: 参加者なし。
2. `recruiting`: 参加者が1名以上、必要人員未満。
3. `help_wanted`: 参加者が助っ人募集をONにした状態。
4. `in_progress`: 参加人数が必要人員に到達。
5. `completed`: 討伐完了。

### `adventurer_tasks`

冒険者手帳の任務を保存します。`quest_id` により生成済みクエストと1対1で紐づきます。

| Column | Notes |
| --- | --- |
| `owner_name` | 任務の持ち主 |
| `title` / `description` | 任務名と説明 |
| `status` | `todo`, `in_progress`, `completed`, `delegated` |
| `priority` | 1-5。UI上の緊急度。 |
| `importance` | 1-5。重要度。 |
| `due_date` | 納期。任意。 |
| `calendar_event_id` | 関連するギルド暦予定。任務の納期とは別に、既存予定へ紐づける場合に使います。 |
| `is_public` | ギルド全体に見せる任務かどうか |
| `quest_id` | 依頼書化で生成されたクエスト。任意。 |

### `guild_notices`

ギルド速報に表示する通知を保存します。

| Column | Notes |
| --- | --- |
| `type` | `deadline_warning`, `overdue`, `missing_task`, `suggestion`, `system` |
| `target_player` | 通知の対象冒険者 |
| `related_task_id` | 関連任務 |
| `related_quest_id` | 関連クエスト |
| `dismissed` | 閉じた通知かどうか |

### `guild_requests`

助言、指名依頼、ギルド指令を保存します。

| Column | Notes |
| --- | --- |
| `request_type` | `suggestion`, `assignment`, `directive` |
| `from_player` / `to_player` | 送信者と対象者 |
| `status` | `pending`, `accepted`, `rejected`, `completed` |
| `priority` / `importance` | 任務化するときの緊急度・重要度 |
| `due_date` | 任務化するときの納期 |
| `calendar_event_id` | 関連するギルド暦予定 |
| `related_task_id` | 発行元の任務 |

### `staff`

パーティ状況に表示するプレイヤー名簿です。認証とは連動していません。

追加の成長表示:

| Column | Notes |
| --- | --- |
| `level` | `floor(exp / 100) + 1` で更新 |
| `exp` | クエスト達成時に協力者へ付与 |
| `title` | プレイヤー称号 |
| `avatar_frame` | `bronze`, `silver`, `gold`, `platinum` |

### `quest_logs`

任務作成、依頼書化、参加、助っ人募集、達成、編集、削除、再掲の履歴を保存します。

遠征開始・帰還も `quest_logs` に記録します。

### `player_resources`

遠征チケット、GOLD、アイテムなど、プレイヤーごとの所持資源を保存します。

### `expeditions`

遠征先、出発時刻、帰還予定時刻、報酬、受取状態を保存します。
同じ冒険者が同時に進められる遠征は1件までです。

### `calendar_events`

ギルド暦の予定を保存します。

| Column | Notes |
| --- | --- |
| `event_date` | 予定日 |
| `start_time` / `end_time` | 任意の開始・終了時刻 |
| `event_type` | `guild`, `personal`, `shift`, `deadline`, `memo` |
| `importance` | 1-5。重要予定の強調に使用 |
| `owner_name` | 個人予定などの対象者 |
| `linked_quest_id` | 関連するクエスト。任意。 |

## 現在の制限

- Supabase Authによる本格認証は未実装です。
- ギルドコードは簡易ゲートであり、本格的な権限管理ではありません。
- RLSはプロトタイプ用に匿名読み書きを許可しています。
- 遠征も簡易放置ゲーム要素であり、匿名操作を前提にしたプロトタイプ実装です。
- ランキングはまだありません。
- 操作中の冒険者と入場状態はブラウザの `localStorage` に保存されます。

## ビルド

```bash
npm run build
npm run preview
```
