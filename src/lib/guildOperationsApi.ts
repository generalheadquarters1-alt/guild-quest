import type {
  AdventurerTask,
  AdventurerTaskFormData,
  QuestPublishFormData,
} from "../data/adventurerTasks";
import {
  getDeadlineNoticeCopy,
  type GuildNotice,
  type GuildNoticeType,
  type GuildRequest,
  type GuildRequestFormData,
  type GuildRequestStatus,
  type GuildRequestType,
} from "../data/guildOperations";
import { createAdventurerTask, delegateTaskToQuest } from "./adventurerTaskApi";
import { insertQuestLog } from "./questLogApi";
import { requireSupabase } from "./supabase";

export interface GuildNoticeRow {
  id: number;
  type: string;
  title: string;
  message: string;
  target_player: string | null;
  related_task_id: number | null;
  related_quest_id: number | null;
  created_at: string;
  dismissed: boolean;
}

export interface GuildRequestRow {
  id: number;
  request_type: string;
  from_player: string | null;
  to_player: string | null;
  task_title: string;
  task_description: string | null;
  status: string;
  priority: number;
  importance: number;
  due_date: string | null;
  calendar_event_id: number | null;
  related_task_id: number | null;
  created_at: string;
  responded_at: string | null;
}

const NOTICE_TYPES: GuildNoticeType[] = [
  "deadline_warning",
  "overdue",
  "missing_task",
  "suggestion",
  "system",
];

const REQUEST_TYPES: GuildRequestType[] = [
  "suggestion",
  "assignment",
  "directive",
];

const REQUEST_STATUSES: GuildRequestStatus[] = [
  "pending",
  "accepted",
  "rejected",
  "completed",
];

export function rowToGuildNotice(row: GuildNoticeRow): GuildNotice {
  return {
    id: row.id,
    type: parseNoticeType(row.type),
    title: row.title,
    message: row.message,
    targetPlayer: row.target_player ?? "",
    relatedTaskId: row.related_task_id,
    relatedQuestId: row.related_quest_id,
    createdAt: row.created_at,
    dismissed: row.dismissed,
  };
}

export function rowToGuildRequest(row: GuildRequestRow): GuildRequest {
  return {
    id: row.id,
    requestType: parseRequestType(row.request_type),
    fromPlayer: row.from_player ?? "",
    toPlayer: row.to_player ?? "",
    taskTitle: row.task_title,
    taskDescription: row.task_description ?? "",
    status: parseRequestStatus(row.status),
    priority: clampScore(row.priority),
    importance: clampScore(row.importance),
    dueDate: row.due_date ?? "",
    calendarEventId: row.calendar_event_id,
    relatedTaskId: row.related_task_id,
    createdAt: row.created_at,
    respondedAt: row.responded_at,
  };
}

export async function fetchGuildNotices(): Promise<GuildNotice[]> {
  const { data, error } = await requireSupabase()
    .from("guild_notices")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data as GuildNoticeRow[]).map(rowToGuildNotice);
}

export async function fetchGuildRequests(): Promise<GuildRequest[]> {
  const { data, error } = await requireSupabase()
    .from("guild_requests")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data as GuildRequestRow[]).map(rowToGuildRequest);
}

export async function dismissGuildNotice(id: number): Promise<void> {
  const { error } = await requireSupabase()
    .from("guild_notices")
    .update({ dismissed: true })
    .eq("id", id);

  if (error) throw error;
}

export async function createGuildRequest(
  form: GuildRequestFormData,
  actorName: string,
  relatedTaskId?: number | null,
): Promise<GuildRequest> {
  const { data, error } = await requireSupabase()
    .from("guild_requests")
    .insert({
      request_type: form.requestType,
      from_player: actorName,
      to_player: form.toPlayer,
      task_title: form.taskTitle.trim(),
      task_description: form.taskDescription.trim() || null,
      status: "pending",
      priority: form.priority,
      importance: form.importance,
      due_date: form.dueDate || null,
      calendar_event_id: form.calendarEventId,
      related_task_id: relatedTaskId ?? null,
    })
    .select("*")
    .single();

  if (error) throw error;
  const request = rowToGuildRequest(data as GuildRequestRow);

  await createNotice({
    type: form.requestType === "suggestion" ? "suggestion" : "system",
    title:
      form.requestType === "suggestion"
        ? `${actorName}から助言が届きました`
        : "新たな依頼が届きました",
    message:
      form.requestType === "suggestion"
        ? `${form.taskTitle}を任務へ追加しませんか？`
        : `ギルドより「${form.taskTitle}」の依頼が届いています。`,
    targetPlayer: form.toPlayer,
    relatedTaskId: relatedTaskId ?? null,
    relatedQuestId: null,
  });

  await insertQuestLog({
    questId: null,
    questTitle: form.taskTitle,
    action:
      form.requestType === "suggestion"
        ? "guild_suggestion_sent"
        : "guild_assignment_sent",
    actorName,
    details: `宛先: ${form.toPlayer}`,
  });

  return request;
}

export async function issueGuildDirective(
  form: GuildRequestFormData,
  actorName: string,
  targetPlayers: string[],
  relatedTaskId?: number | null,
): Promise<GuildRequest[]> {
  const rows = await Promise.all(
    targetPlayers.map(async (targetPlayer) => {
      const { data, error } = await requireSupabase()
        .from("guild_requests")
        .insert({
          request_type: "directive",
          from_player: actorName,
          to_player: targetPlayer,
          task_title: form.taskTitle.trim(),
          task_description: form.taskDescription.trim() || null,
          status: "accepted",
          priority: form.priority,
          importance: form.importance,
          due_date: form.dueDate || null,
          calendar_event_id: form.calendarEventId,
          related_task_id: relatedTaskId ?? null,
          responded_at: new Date().toISOString(),
        })
        .select("*")
        .single();

      if (error) throw error;
      await createAdventurerTask(requestToTaskForm(form), targetPlayer);
      await createNotice({
        type: "system",
        title: "ギルド指令が発令されました",
        message: `「${form.taskTitle}」が冒険者手帳へ追加されました。`,
        targetPlayer,
        relatedTaskId: relatedTaskId ?? null,
        relatedQuestId: null,
      });
      return rowToGuildRequest(data as GuildRequestRow);
    }),
  );

  await insertQuestLog({
    questId: null,
    questTitle: form.taskTitle,
    action: "guild_directive_issued",
    actorName,
    details: `対象: ${targetPlayers.join(" / ")}`,
  });

  return rows;
}

export async function acceptGuildRequest(
  request: GuildRequest,
  actorName: string,
): Promise<void> {
  const task = await createAdventurerTask(requestToTaskForm(request), actorName);
  if (request.requestType === "assignment") {
    await delegateTaskToQuest(task, actorName, requestToQuestPublishForm(request));
  }

  const { error } = await requireSupabase()
    .from("guild_requests")
    .update({
      status: "accepted",
      responded_at: new Date().toISOString(),
    })
    .eq("id", request.id);

  if (error) throw error;

  if (request.fromPlayer) {
    await createNotice({
      type: "system",
      title: `${actorName}が依頼を承認しました`,
      message: `「${request.taskTitle}」を受諾しました。`,
      targetPlayer: request.fromPlayer,
      relatedTaskId: task.id,
      relatedQuestId: task.questId,
    });
  }

  await insertQuestLog({
    questId: task.questId,
    questTitle: request.taskTitle,
    action: "guild_request_accepted",
    actorName,
  });
}

export async function rejectGuildRequest(
  request: GuildRequest,
  actorName: string,
): Promise<void> {
  const { error } = await requireSupabase()
    .from("guild_requests")
    .update({
      status: "rejected",
      responded_at: new Date().toISOString(),
    })
    .eq("id", request.id);

  if (error) throw error;

  if (request.fromPlayer) {
    await createNotice({
      type: "system",
      title: `${actorName}が提案を却下しました`,
      message: `「${request.taskTitle}」は今回は受け取りませんでした。`,
      targetPlayer: request.fromPlayer,
      relatedTaskId: request.relatedTaskId,
      relatedQuestId: null,
    });
  }

  await insertQuestLog({
    questId: null,
    questTitle: request.taskTitle,
    action: "guild_request_rejected",
    actorName,
  });
}

export async function syncDeadlineNotices(
  tasks: AdventurerTask[],
): Promise<void> {
  const activeTasks = tasks.filter((task) => task.status !== "completed");
  for (const task of activeTasks) {
    const copy = getDeadlineNoticeCopy(task);
    if (!copy) continue;

    const { data: existing, error: existingError } = await requireSupabase()
      .from("guild_notices")
      .select("*")
      .eq("related_task_id", task.id)
      .eq("type", copy.type)
      .eq("dismissed", false)
      .maybeSingle();

    if (existingError) throw existingError;

    if (existing) {
      const notice = existing as GuildNoticeRow;
      if (notice.title === copy.title && notice.message === copy.message) {
        continue;
      }
      const { error } = await requireSupabase()
        .from("guild_notices")
        .update({
          title: copy.title,
          message: copy.message,
        })
        .eq("id", notice.id);
      if (error) throw error;
      continue;
    }

    await createNotice({
      type: copy.type,
      title: copy.title,
      message: copy.message,
      targetPlayer: task.ownerName,
      relatedTaskId: task.id,
      relatedQuestId: task.questId,
    });
  }
}

async function createNotice(params: {
  type: GuildNoticeType;
  title: string;
  message: string;
  targetPlayer: string;
  relatedTaskId: number | null;
  relatedQuestId: number | null;
}) {
  const { error } = await requireSupabase().from("guild_notices").insert({
    type: params.type,
    title: params.title,
    message: params.message,
    target_player: params.targetPlayer || null,
    related_task_id: params.relatedTaskId,
    related_quest_id: params.relatedQuestId,
  });

  if (error) throw error;
}

function requestToTaskForm(
  request: Pick<
    GuildRequest | GuildRequestFormData,
    | "taskTitle"
    | "taskDescription"
    | "priority"
    | "importance"
    | "dueDate"
    | "calendarEventId"
  >,
): AdventurerTaskFormData {
  return {
    title: request.taskTitle,
    description: request.taskDescription,
    priority: request.priority,
    importance: request.importance,
    dueDate: request.dueDate,
    calendarEventId: request.calendarEventId,
    isPublic: false,
  };
}

function requestToQuestPublishForm(
  request: Pick<
    GuildRequest,
    "taskTitle" | "taskDescription" | "priority" | "importance" | "dueDate"
  >,
): QuestPublishFormData {
  return {
    title: request.taskTitle,
    description: request.taskDescription,
    difficulty: difficultyFromScores(request.priority, request.importance),
    estimatedMinutes: 30,
    dueDate: request.dueDate || new Date().toISOString().slice(0, 10),
    dueTime: "18:00",
    requiredMembers: 1,
  };
}

function difficultyFromScores(priority: number, importance: number) {
  const score = priority * importance;
  if (score >= 20) return 5;
  if (score >= 12) return 4;
  if (score >= 8) return 3;
  if (score >= 4) return 2;
  return 1;
}

function parseNoticeType(value: string): GuildNoticeType {
  if (NOTICE_TYPES.includes(value as GuildNoticeType)) {
    return value as GuildNoticeType;
  }
  return "system";
}

function parseRequestType(value: string): GuildRequestType {
  if (REQUEST_TYPES.includes(value as GuildRequestType)) {
    return value as GuildRequestType;
  }
  return "suggestion";
}

function parseRequestStatus(value: string): GuildRequestStatus {
  if (REQUEST_STATUSES.includes(value as GuildRequestStatus)) {
    return value as GuildRequestStatus;
  }
  return "pending";
}

function clampScore(value: number | null | undefined): number {
  if (!Number.isFinite(value)) return 3;
  return Math.min(5, Math.max(1, Math.round(Number(value))));
}
