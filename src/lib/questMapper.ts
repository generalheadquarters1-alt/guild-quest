import {
  EMPTY_SLOT,
  type CompletedQuestEntry,
  type Priority,
  type Quest,
  type QuestLevel,
  type QuestStatus,
} from "../data/quests";

export interface QuestRow {
  id: number;
  requester: string;
  title: string;
  level: string;
  priority: string;
  urgency?: number | null;
  importance?: number | null;
  estimated_time: string | null;
  description: string | null;
  challenger: string | null;
  successor1: string | null;
  successor2: string | null;
  status: string;
  created_at: string;
  completed_at: string | null;
  linked_event_id?: number | null;
}

const STATUSES: QuestStatus[] = [
  "open",
  "in_progress",
  "succession_needed",
  "completed",
];

function slotFromDb(value: string | null | undefined): string {
  if (value == null || value.trim() === "") return EMPTY_SLOT;
  return value;
}

function slotToDb(value: string): string | null {
  if (value === EMPTY_SLOT || !value.trim()) return null;
  return value;
}

function parseStatus(value: string): QuestStatus {
  if (STATUSES.includes(value as QuestStatus)) {
    return value as QuestStatus;
  }
  return "open";
}

export function rowToQuest(row: QuestRow): Quest {
  return {
    id: row.id,
    requester: row.requester,
    title: row.title,
    level: row.level as QuestLevel,
    priority: row.priority as Priority,
    urgency: clampScore(row.urgency),
    importance: clampScore(row.importance),
    estimatedTime: row.estimated_time?.trim() || EMPTY_SLOT,
    description: row.description ?? "",
    challenger: slotFromDb(row.challenger),
    successor1: slotFromDb(row.successor1),
    successor2: slotFromDb(row.successor2),
    status: parseStatus(row.status),
    createdAt: row.created_at,
    completedAt: row.completed_at,
    linkedEventId: row.linked_event_id ?? null,
  };
}

export function questToRow(quest: Quest): Omit<QuestRow, "id"> {
  return {
    requester: quest.requester,
    title: quest.title,
    level: quest.level,
    priority: quest.priority,
    urgency: quest.urgency,
    importance: quest.importance,
    estimated_time:
      quest.estimatedTime === EMPTY_SLOT ? null : quest.estimatedTime,
    description: quest.description || null,
    challenger: slotToDb(quest.challenger),
    successor1: slotToDb(quest.successor1),
    successor2: slotToDb(quest.successor2),
    status: quest.status,
    created_at: quest.createdAt ?? new Date().toISOString(),
    completed_at: quest.completedAt ?? null,
    linked_event_id: quest.linkedEventId ?? null,
  };
}

function clampScore(value: number | null | undefined): number {
  if (!Number.isFinite(value)) return 3;
  return Math.min(5, Math.max(1, Math.round(Number(value))));
}

export function questToUpdatePayload(
  quest: Quest,
): Omit<QuestRow, "id" | "created_at"> {
  const row = questToRow(quest);
  const { created_at: _c, ...rest } = row;
  return rest;
}

export function partitionQuests(quests: Quest[]): {
  active: Quest[];
  completed: CompletedQuestEntry[];
} {
  const active: Quest[] = [];
  const completed: CompletedQuestEntry[] = [];

  for (const quest of quests) {
    if (quest.status === "completed") {
      completed.push({
        quest,
        completedAt:
          quest.completedAt ??
          quest.createdAt ??
          new Date().toISOString(),
      });
    } else {
      active.push(quest);
    }
  }

  return { active, completed };
}
