import {
  EMPTY_SLOT,
  type CompletedQuestEntry,
  type Quest,
  type QuestStatus,
} from "../data/quests";

const STATUS_ORDER: Record<QuestStatus, number> = {
  open: 0,
  succession_needed: 1,
  in_progress: 2,
  completed: 3,
};

export function isEmptySlot(value: string): boolean {
  return value === EMPTY_SLOT || !value.trim();
}

export function sortQuests(quests: Quest[]): Quest[] {
  return [...quests].sort((a, b) => {
    const byScore = getPriorityScore(b) - getPriorityScore(a);
    if (byScore !== 0) return byScore;
    const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (byStatus !== 0) return byStatus;
    return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
  });
}

export function getPriorityScore(quest: Quest): number {
  return quest.urgency * quest.importance;
}

export function getQuestBaseExp(quest: Quest): number {
  return getPriorityScore(quest) * 10;
}

export function getQuestGuildExp(quest: Quest): number {
  const base = getQuestBaseExp(quest);
  const successors = [quest.successor1, quest.successor2].filter(
    (slot) => !isEmptySlot(slot),
  ).length;
  return base + successors * Math.floor(base * 0.6);
}

export function sortCompletedLog(
  entries: CompletedQuestEntry[],
): CompletedQuestEntry[] {
  return [...entries].sort(
    (a, b) =>
      new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime(),
  );
}

export function isPlayerOnQuest(quest: Quest, playerName: string): boolean {
  return (
    quest.challenger === playerName ||
    quest.successor1 === playerName ||
    quest.successor2 === playerName
  );
}

export function countMyQuests(quests: Quest[], playerName: string): number {
  return quests.filter((q) => isPlayerOnQuest(q, playerName)).length;
}

export function deriveStatusAfterRosterChange(quest: Quest): QuestStatus {
  if (isEmptySlot(quest.challenger)) return "open";
  if (isEmptySlot(quest.successor1) || isEmptySlot(quest.successor2)) {
    return "succession_needed";
  }
  return "in_progress";
}

export function canAcceptQuest(quest: Quest): boolean {
  return isEmptySlot(quest.challenger);
}

export function canBecomeSuccessor(quest: Quest, playerName: string): boolean {
  if (isPlayerOnQuest(quest, playerName)) return false;
  return isEmptySlot(quest.successor1) || isEmptySlot(quest.successor2);
}

export function canRequestSuccession(
  quest: Quest,
  playerName: string,
): boolean {
  return (
    quest.challenger === playerName &&
    quest.status === "in_progress"
  );
}

export function canMarkComplete(quest: Quest, playerName: string): boolean {
  if (quest.status === "open") return false;
  return isPlayerOnQuest(quest, playerName);
}

export function formatCompletedDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ja-JP", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
