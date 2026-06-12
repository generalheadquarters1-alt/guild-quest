import {
  EMPTY_SLOT,
  type CompletedQuestEntry,
  type Priority,
  type Quest,
  type QuestDifficulty,
  type QuestLevel,
  type QuestStatus,
  QUEST_DIFFICULTY_BY_LEVEL,
  QUEST_LEVEL_BY_DIFFICULTY,
  ESTIMATED_MINUTE_OPTIONS,
} from "../data/quests";

export interface QuestRow {
  id: number;
  requester: string;
  title: string;
  level: string;
  difficulty?: number | null;
  priority: string;
  urgency?: number | null;
  importance?: number | null;
  estimated_time: string | null;
  estimated_minutes?: number | null;
  due_at?: string | null;
  description: string | null;
  challenger: string | null;
  successor1: string | null;
  successor2: string | null;
  required_members?: number | null;
  participants?: string[] | null;
  status: string;
  created_at: string;
  completed_at: string | null;
  linked_event_id?: number | null;
}

const STATUSES: QuestStatus[] = [
  "open",
  "recruiting",
  "in_progress",
  "help_wanted",
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
  if (value === "succession_needed") return "help_wanted";
  if (STATUSES.includes(value as QuestStatus)) {
    return value as QuestStatus;
  }
  return "open";
}

function parseDifficulty(value: number | null | undefined, level: string): QuestDifficulty {
  if (Number.isFinite(value)) {
    return Math.min(5, Math.max(1, Math.round(Number(value)))) as QuestDifficulty;
  }
  const normalized = level as QuestLevel;
  return QUEST_DIFFICULTY_BY_LEVEL[normalized] ?? 3;
}

export function formatEstimatedMinutes(minutes: number | null | undefined): string {
  if (!Number.isFinite(minutes)) return EMPTY_SLOT;
  const option = ESTIMATED_MINUTE_OPTIONS.find((item) => item.value === minutes);
  if (option) return option.label;
  return `${minutes}分`;
}

function parseParticipants(row: QuestRow): string[] {
  const source =
    row.participants && row.participants.length > 0
      ? row.participants
      : [row.challenger, row.successor1, row.successor2];
  return source
    .map((name) => (name ?? "").trim())
    .filter((name) => name.length > 0 && name !== EMPTY_SLOT)
    .filter((name, index, array) => array.indexOf(name) === index)
    .slice(0, 3);
}

function clampMembers(value: number | null | undefined): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(3, Math.max(1, Math.round(Number(value))));
}

export function rowToQuest(row: QuestRow): Quest {
  const difficulty = parseDifficulty(row.difficulty, row.level);
  const estimatedMinutes = Number.isFinite(row.estimated_minutes)
    ? Math.max(1, Math.round(Number(row.estimated_minutes)))
    : null;
  const participants = parseParticipants(row);
  const requiredMembers = clampMembers(row.required_members);

  return {
    id: row.id,
    requester: row.requester,
    title: row.title,
    level: QUEST_LEVEL_BY_DIFFICULTY[difficulty],
    difficulty,
    priority: row.priority as Priority,
    urgency: clampScore(row.urgency),
    importance: clampScore(row.importance),
    estimatedTime:
      row.estimated_time?.trim() ||
      formatEstimatedMinutes(estimatedMinutes),
    estimatedMinutes,
    dueAt: row.due_at ?? null,
    description: row.description ?? "",
    challenger: slotFromDb(participants[0]),
    successor1: slotFromDb(participants[1]),
    successor2: slotFromDb(participants[2]),
    requiredMembers,
    participants,
    status: parseStatus(row.status),
    createdAt: row.created_at,
    completedAt: row.completed_at,
    linkedEventId: row.linked_event_id ?? null,
  };
}

export function questToRow(quest: Quest): Omit<QuestRow, "id"> {
  const participants = quest.participants
    .map((name) => name.trim())
    .filter(Boolean)
    .filter((name, index, array) => array.indexOf(name) === index)
    .slice(0, quest.requiredMembers);

  return {
    requester: quest.requester,
    title: quest.title,
    level: QUEST_LEVEL_BY_DIFFICULTY[quest.difficulty],
    difficulty: quest.difficulty,
    priority: quest.priority,
    urgency: quest.urgency,
    importance: quest.importance,
    estimated_minutes: quest.estimatedMinutes,
    due_at: quest.dueAt,
    estimated_time:
      quest.estimatedTime === EMPTY_SLOT
        ? quest.estimatedMinutes == null
          ? null
          : formatEstimatedMinutes(quest.estimatedMinutes)
        : quest.estimatedTime,
    description: quest.description || null,
    challenger: slotToDb(participants[0] ?? EMPTY_SLOT),
    successor1: slotToDb(participants[1] ?? EMPTY_SLOT),
    successor2: slotToDb(participants[2] ?? EMPTY_SLOT),
    required_members: quest.requiredMembers,
    participants,
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
