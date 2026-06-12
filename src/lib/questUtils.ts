import {
  EMPTY_SLOT,
  type CompletedQuestEntry,
  type Quest,
  type QuestStatus,
} from "../data/quests";

const STATUS_ORDER: Record<QuestStatus, number> = {
  open: 0,
  recruiting: 1,
  help_wanted: 2,
  in_progress: 3,
  completed: 4,
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
  const helpers = Math.max(0, quest.participants.length - 1);
  return base + helpers * Math.floor(base * 0.6);
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
  return quest.participants.includes(playerName);
}

export function countMyQuests(quests: Quest[], playerName: string): number {
  return quests.filter((q) => isPlayerOnQuest(q, playerName)).length;
}

export function deriveStatusAfterRosterChange(quest: Quest): QuestStatus {
  if (quest.status === "completed") return "completed";
  const count = quest.participants.length;
  if (count <= 0) return "open";
  if (count >= quest.requiredMembers) return "in_progress";
  if (quest.status === "help_wanted") return "help_wanted";
  return "recruiting";
}

export function canAcceptQuest(quest: Quest): boolean {
  if (quest.status === "completed") return false;
  return quest.participants.length < quest.requiredMembers;
}

export function canBecomeSuccessor(quest: Quest, playerName: string): boolean {
  if (isPlayerOnQuest(quest, playerName)) return false;
  if (quest.status === "completed") return false;
  return quest.participants.length < quest.requiredMembers;
}

export function canRequestSuccession(
  quest: Quest,
  playerName: string,
): boolean {
  return (
    isPlayerOnQuest(quest, playerName) &&
    quest.status !== "completed" &&
    quest.participants.length < quest.requiredMembers
  );
}

export function canMarkComplete(quest: Quest, playerName: string): boolean {
  if (quest.status === "open") return false;
  if (quest.status === "completed") return false;
  return isPlayerOnQuest(quest, playerName);
}

export function isQuestFull(quest: Quest): boolean {
  return quest.participants.length >= quest.requiredMembers;
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
