# ギルドクエスト

職場の作業を「ギルドのクエスト」として扱う、プレイヤー向け共有ギルドボードです。  
主な利用想定は、アミューズメント店舗・小売店舗・現場運営チームの当日作業共有です。

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
6. Deploy後、実URLでクエスト作成・受注・達成・Realtime反映を確認します。

## 初回利用フロー

1. Vercel URLまたはローカルURLを開きます。
2. 「ギルドへの入場」画面で合言葉を入力します。
3. 冒険者名を入力します。
4. 合言葉が正しければ、冒険者名が `staff` テーブルに登録されます。
5. 同じ名前が既に `staff` にある場合は重複登録せず、その冒険者として入場します。
6. 次回以降、同じ端末では合言葉と冒険者名の入力なしで自動入場します。

保存に使う `localStorage`:

- `guild_quest_access_granted`
- `guild_quest_player_name`

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

## パイロット運用ルール

最初の1-2週間は、以下のルールで小さく始めるのがおすすめです。

1. クエストは「今日または今週中に達成できる作業」だけ登録します。
2. 緊急度は絞ります。`S Rank` は当日中に誰かが見るべきものだけにします。
3. 受注した人が作業の主担当です。途中で離れる場合は「継承を依頼」を使います。
4. 継承者は作業の引き継ぎ・フォロー担当です。責任者ランキングには使いません。
5. 達成時は、必要なら冒険の記録で後から追える短い理由を残します。
6. 1日の終わりに、未受注・継承募集・緊急だけを確認します。
7. スタッフへの説明では「評価」ではなく「見落とし防止」として運用します。

## データモデル

### `quests`

| Column | Notes |
| --- | --- |
| `id` | 自動採番 |
| `status` | `open`, `in_progress`, `succession_needed`, `completed` |
| `priority` | `S`, `A`, `B`, `C` |
| `urgency` | 1-5。緊急度。 |
| `importance` | 1-5。重要度。 |
| `completed_at` | 達成時に設定、再掲時にクリア |

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

作成、受注、継承依頼、継承参加、達成、編集、削除、再掲の履歴を保存します。

## 現在の制限

- Supabase Authによる本格認証は未実装です。
- ギルドコードは簡易ゲートであり、本格的な権限管理ではありません。
- RLSはプロトタイプ用に匿名読み書きを許可しています。
- ランキングやEXP計算はまだありません。
- 操作中の冒険者と入場状態はブラウザの `localStorage` に保存されます。

## ビルド

```bash
npm run build
npm run preview
```
