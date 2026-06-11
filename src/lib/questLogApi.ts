import { requireSupabase } from "./supabase";

export type QuestLogAction =
  | "created"
  | "accepted"
  | "succession_requested"
  | "successor_added"
  | "completed"
  | "edited"
  | "deleted"
  | "reopened"
  | "expedition_started"
  | "expedition_claimed"
  | "calendar_event_created"
  | "calendar_event_updated"
  | "calendar_event_deleted"
  | "quest_linked_event"
  | "task_created"
  | "task_updated"
  | "task_deleted"
  | "task_delegated"
  | "task_completed"
  | "guild_suggestion_sent"
  | "guild_assignment_sent"
  | "guild_directive_issued"
  | "guild_request_accepted"
  | "guild_request_rejected";

export interface QuestLog {
  id: number;
  questId: number | null;
  questTitle: string;
  action: QuestLogAction;
  actorName: string | null;
  details: string | null;
  createdAt: string;
}

export interface QuestLogRow {
  id: number;
  quest_id: number | null;
  quest_title: string;
  action: string;
  actor_name: string | null;
  details: string | null;
  created_at: string;
}

export function rowToQuestLog(row: QuestLogRow): QuestLog {
  return {
    id: row.id,
    questId: row.quest_id,
    questTitle: row.quest_title,
    action: row.action as QuestLogAction,
    actorName: row.actor_name,
    details: row.details,
    createdAt: row.created_at,
  };
}

export async function fetchQuestLogs(limit = 40): Promise<QuestLog[]> {
  const { data, error } = await requireSupabase()
    .from("quest_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data as QuestLogRow[]).map(rowToQuestLog);
}

export async function insertQuestLog(params: {
  questId: number | null;
  questTitle: string;
  action: QuestLogAction;
  actorName?: string;
  details?: string | null;
}): Promise<void> {
  const { error } = await requireSupabase().from("quest_logs").insert({
    quest_id: params.questId,
    quest_title: params.questTitle,
    action: params.action,
    actor_name: params.actorName ?? null,
    details: params.details?.trim() || null,
  });

  if (error) throw error;
}

export const LOG_ACTION_LABELS: Record<QuestLogAction, string> = {
  created: "新しい依頼を掲示",
  accepted: "クエストに挑戦",
  succession_requested: "助っ人募集を掲示",
  successor_added: "助っ人として参加",
  completed: "討伐完了",
  edited: "クエスト内容を編集",
  deleted: "クエストを削除",
  reopened: "クエストを再掲",
  expedition_started: "遠征へ出発",
  expedition_claimed: "遠征から帰還",
  calendar_event_created: "ギルド暦に追加",
  calendar_event_updated: "ギルド暦を更新",
  calendar_event_deleted: "ギルド暦から削除",
  quest_linked_event: "予定と関連付け",
  task_created: "任務を記録",
  task_updated: "任務を更新",
  task_deleted: "任務を削除",
  task_delegated: "任務を依頼書化",
  task_completed: "任務を達成",
  guild_suggestion_sent: "助言を送信",
  guild_assignment_sent: "指名依頼を送信",
  guild_directive_issued: "ギルド指令を発令",
  guild_request_accepted: "提案を承認",
  guild_request_rejected: "提案を却下",
};
