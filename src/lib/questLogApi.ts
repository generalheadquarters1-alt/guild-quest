import { requireSupabase } from "./supabase";

export type QuestLogAction =
  | "created"
  | "accepted"
  | "succession_requested"
  | "successor_added"
  | "completed"
  | "edited"
  | "deleted"
  | "reopened";

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
  created: "新規クエストを掲示",
  accepted: "クエストに挑戦",
  succession_requested: "継承を依頼",
  successor_added: "継承者として参加",
  completed: "討伐完了",
  edited: "クエスト内容を編集",
  deleted: "クエストを削除",
  reopened: "クエストを再掲",
};
