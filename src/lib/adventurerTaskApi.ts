import {
  getTaskBaseExp,
  getTaskScore,
  type AdventurerTask,
  type AdventurerTaskFormData,
  type AdventurerTaskStatus,
  type QuestPublishFormData,
} from "../data/adventurerTasks";
import { getExpeditionTicketsForRank } from "../data/expeditions";
import {
  ESTIMATED_MINUTE_OPTIONS,
  QUEST_LEVEL_BY_DIFFICULTY,
  type Quest,
  type Priority,
} from "../data/quests";
import { awardExpeditionTickets } from "./expeditionApi";
import { insertQuestLog } from "./questLogApi";
import { rowToQuest, type QuestRow } from "./questMapper";
import { requireSupabase } from "./supabase";
import { awardPlayerExp } from "./staffApi";

export interface AdventurerTaskRow {
  id: number;
  owner_name: string;
  original_owner_name: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: number;
  importance: number;
  due_date: string | null;
  calendar_event_id: number | null;
  is_public: boolean;
  quest_id: number | null;
  created_at: string;
  updated_at: string;
}

const TASK_STATUSES: AdventurerTaskStatus[] = [
  "todo",
  "in_progress",
  "completed",
  "delegated",
];

export function rowToAdventurerTask(row: AdventurerTaskRow): AdventurerTask {
  return {
    id: row.id,
    ownerName: row.owner_name,
    originalOwnerName: row.original_owner_name ?? row.owner_name,
    title: row.title,
    description: row.description ?? "",
    status: parseTaskStatus(row.status),
    priority: clampScore(row.priority),
    importance: clampScore(row.importance),
    dueDate: row.due_date,
    calendarEventId: row.calendar_event_id,
    isPublic: row.is_public,
    questId: row.quest_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchAdventurerTasks(): Promise<AdventurerTask[]> {
  const { data, error } = await requireSupabase()
    .from("adventurer_tasks")
    .select("*")
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data as AdventurerTaskRow[]).map(rowToAdventurerTask);
}

export async function createAdventurerTask(
  form: AdventurerTaskFormData,
  ownerName: string,
): Promise<AdventurerTask> {
  const { data, error } = await requireSupabase()
    .from("adventurer_tasks")
    .insert(toTaskPayload(form, ownerName, form.calendarEventId, "todo"))
    .select("*")
    .single();

  if (error) throw error;
  const task = rowToAdventurerTask(data as AdventurerTaskRow);

  await insertQuestLog({
    questId: null,
    questTitle: task.title,
    action: "task_created",
    actorName: ownerName,
  });

  return task;
}

export async function updateAdventurerTask(
  task: AdventurerTask,
  form: AdventurerTaskFormData,
  actorName: string,
): Promise<AdventurerTask> {
  const { data, error } = await requireSupabase()
    .from("adventurer_tasks")
    .update(
      toTaskPayload(
        form,
        task.ownerName,
        form.calendarEventId,
        task.status,
        task.questId,
        task.originalOwnerName,
      ),
    )
    .eq("id", task.id)
    .select("*")
    .single();

  if (error) throw error;
  const updated = rowToAdventurerTask(data as AdventurerTaskRow);

  await insertQuestLog({
    questId: updated.questId,
    questTitle: updated.title,
    action: "task_updated",
    actorName,
  });

  return updated;
}

export async function deleteAdventurerTask(
  task: AdventurerTask,
  actorName: string,
): Promise<void> {
  await insertQuestLog({
    questId: task.questId,
    questTitle: task.title,
    action: "task_deleted",
    actorName,
  });

  const { error } = await requireSupabase()
    .from("adventurer_tasks")
    .delete()
    .eq("id", task.id);

  if (error) throw error;
}

export async function completeAdventurerTask(
  task: AdventurerTask,
  actorName: string,
): Promise<AdventurerTask> {
  const updated = await updateTaskStatus(task.id, "completed");
  const exp = getTaskBaseExp(task);

  await awardPlayerExp([{ name: task.ownerName, exp }]);
  await awardExpeditionTickets(
    actorName,
    getExpeditionTicketsForRank(getTaskScore(task)),
  );

  await insertQuestLog({
    questId: task.questId,
    questTitle: task.title,
    action: "task_completed",
    actorName,
  });

  return updated;
}

export async function delegateTaskToQuest(
  task: AdventurerTask,
  actorName: string,
  form: QuestPublishFormData,
): Promise<{ task: AdventurerTask; quest: Quest }> {
  if (task.questId != null) {
    const quest = await fetchQuestById(task.questId);
    const updatedTask = await updateTaskStatus(task.id, "delegated", task.questId);
    return { task: updatedTask, quest };
  }

  const linkedEventId = await resolveQuestDeadlineEvent(task, form, actorName);
  const dueAt = toDueIso(form.dueDate, form.dueTime);
  const priority = getQuestPriorityFromTask({
    ...task,
    priority: form.difficulty,
    importance: task.importance,
  });
  const { data: questData, error: questError } = await requireSupabase()
    .from("quests")
    .insert({
      requester: task.ownerName,
      title: form.title.trim(),
      level: QUEST_LEVEL_BY_DIFFICULTY[form.difficulty],
      difficulty: form.difficulty,
      priority,
      urgency: task.priority,
      importance: task.importance,
      estimated_time: formatEstimatedLabel(form.estimatedMinutes),
      estimated_minutes: form.estimatedMinutes,
      due_at: dueAt,
      description: form.description.trim() || null,
      challenger: null,
      successor1: null,
      successor2: null,
      participants: [],
      required_members: form.requiredMembers,
      status: "open",
      completed_at: null,
      linked_event_id: linkedEventId,
    })
    .select("*")
    .single();

  if (questError) throw questError;
  const quest = rowToQuest(questData as QuestRow);

  if (linkedEventId != null) {
    const { error: eventLinkError } = await requireSupabase()
      .from("calendar_events")
      .update({
        linked_quest_id: quest.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", linkedEventId);
    if (eventLinkError) throw eventLinkError;
  }

  const { data: taskData, error: taskError } = await requireSupabase()
    .from("adventurer_tasks")
    .update({
      status: "delegated",
      is_public: true,
      quest_id: quest.id,
      original_owner_name: task.originalOwnerName || task.ownerName,
      calendar_event_id: linkedEventId,
      due_date: form.dueDate,
      updated_at: new Date().toISOString(),
    })
    .eq("id", task.id)
    .select("*")
    .single();

  if (taskError) throw taskError;
  const updatedTask = rowToAdventurerTask(taskData as AdventurerTaskRow);

  await insertQuestLog({
    questId: quest.id,
    questTitle: quest.title,
    action: "task_delegated",
    actorName,
    details: "依頼書設定を通してギルド依頼へ掲載しました。",
  });

  return { task: updatedTask, quest };
}

export async function completeTaskLinkedToQuest(
  questId: number,
  actorName: string,
): Promise<AdventurerTask | null> {
  const { data, error } = await requireSupabase()
    .from("adventurer_tasks")
    .select("*")
    .eq("quest_id", questId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const task = rowToAdventurerTask(data as AdventurerTaskRow);
  if (task.status === "completed") return task;

  const updated = await updateTaskStatus(task.id, "completed", questId);
  await insertQuestLog({
    questId,
    questTitle: task.title,
    action: "task_completed",
    actorName,
    details: "親任務を自動完了しました。",
  });

  return updated;
}

export async function transferTaskToQuestParticipant(
  quest: Pick<Quest, "id" | "title">,
  challengerName: string,
): Promise<AdventurerTask | null> {
  const { data, error } = await requireSupabase()
    .from("adventurer_tasks")
    .select("*")
    .eq("quest_id", quest.id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const task = rowToAdventurerTask(data as AdventurerTaskRow);
  if (task.status === "completed") return task;

  const originalOwnerName = task.originalOwnerName || task.ownerName;
  const ownerChanged = task.ownerName !== challengerName;
  const { data: updatedData, error: updateError } = await requireSupabase()
    .from("adventurer_tasks")
    .update({
      owner_name: challengerName,
      original_owner_name: originalOwnerName,
      status: "in_progress",
      updated_at: new Date().toISOString(),
    })
    .eq("id", task.id)
    .select("*")
    .single();

  if (updateError) throw updateError;
  const updated = rowToAdventurerTask(updatedData as AdventurerTaskRow);

  if (ownerChanged) {
    await insertQuestLog({
      questId: quest.id,
      questTitle: task.title,
      action: "task_transferred",
      actorName: challengerName,
      details: `『${task.title}』の担当が ${task.ownerName} から ${challengerName} へ移りました。`,
    });
  }

  return updated;
}

async function fetchQuestById(questId: number): Promise<Quest> {
  const { data, error } = await requireSupabase()
    .from("quests")
    .select("*")
    .eq("id", questId)
    .single();

  if (error) throw error;
  return rowToQuest(data as QuestRow);
}

async function updateTaskStatus(
  taskId: number,
  status: AdventurerTaskStatus,
  questId?: number | null,
) {
  const payload: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (questId !== undefined) payload.quest_id = questId;

  const { data, error } = await requireSupabase()
    .from("adventurer_tasks")
    .update(payload)
    .eq("id", taskId)
    .select("*")
    .single();

  if (error) throw error;
  return rowToAdventurerTask(data as AdventurerTaskRow);
}

function toTaskPayload(
  form: AdventurerTaskFormData,
  ownerName: string,
  calendarEventId: number | null,
  status: AdventurerTaskStatus,
  questId?: number | null,
  originalOwnerName?: string,
) {
  return {
    owner_name: ownerName,
    original_owner_name: originalOwnerName ?? ownerName,
    title: form.title.trim(),
    description: form.description.trim() || null,
    status,
    priority: clampScore(form.priority),
    importance: clampScore(form.importance),
    due_date: form.dueDate || null,
    calendar_event_id: calendarEventId,
    is_public: form.isPublic,
    quest_id: questId ?? null,
    updated_at: new Date().toISOString(),
  };
}

function parseTaskStatus(value: string): AdventurerTaskStatus {
  return TASK_STATUSES.includes(value as AdventurerTaskStatus)
    ? (value as AdventurerTaskStatus)
    : "todo";
}

function clampScore(value: number | null | undefined): number {
  if (!Number.isFinite(value)) return 3;
  return Math.min(5, Math.max(1, Math.round(Number(value))));
}

function getQuestPriorityFromTask(task: AdventurerTask): Priority {
  const score = getTaskScore(task);
  if (score >= 20) return "S";
  if (score >= 12) return "A";
  if (score >= 6) return "B";
  return "C";
}

async function resolveQuestDeadlineEvent(
  task: AdventurerTask,
  form: QuestPublishFormData,
  actorName: string,
) {
  const existingEventId = task.calendarEventId;
  if (existingEventId != null) return existingEventId;
  void form;
  void actorName;
  return null;
}

function toDueIso(date: string, time: string) {
  if (!date) return null;
  const timeValue = time || "23:59";
  const parsed = new Date(`${date}T${timeValue}`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function formatEstimatedLabel(minutes: number) {
  return (
    ESTIMATED_MINUTE_OPTIONS.find((option) => option.value === minutes)?.label ??
    `${minutes}分`
  );
}
