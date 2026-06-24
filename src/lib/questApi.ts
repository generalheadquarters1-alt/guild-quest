import type { QuestFormData } from "../components/QuestFormModal";
import { getExpeditionTicketsForRank } from "../data/expeditions";
import { EMPTY_SLOT, type Quest } from "../data/quests";
import { awardExpeditionTickets } from "./expeditionApi";
import {
  completeTaskLinkedToQuest,
  transferTaskToQuestParticipant,
} from "./adventurerTaskApi";
import { insertQuestLog } from "./questLogApi";
import { awardPlayerExp } from "./staffApi";
import {
  deriveStatusAfterRosterChange,
  getPriorityScore,
  getQuestBaseExp,
  isEmptySlot,
} from "./questUtils";
import { questToUpdatePayload, rowToQuest, type QuestRow } from "./questMapper";
import { requireSupabase } from "./supabase";

export async function fetchAllQuests(): Promise<Quest[]> {
  const { data, error } = await requireSupabase()
    .from("quests")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data as QuestRow[]).map(rowToQuest);
}

export async function insertQuest(
  form: QuestFormData,
  actorName: string,
): Promise<Quest> {
  const payload = {
    requester: form.requester,
    title: form.title,
    level: form.level,
    priority: form.priority,
    urgency: form.urgency,
    importance: form.importance,
    difficulty: form.difficulty ?? 3,
    estimated_minutes: form.estimatedMinutes ?? null,
    due_at: form.dueAt ?? null,
    required_members: form.requiredMembers ?? 1,
    participants: [],
    estimated_time:
      form.estimatedTime === EMPTY_SLOT ? null : form.estimatedTime,
    description: form.description || null,
    challenger: null,
    successor1: null,
    successor2: null,
    status: "open" as const,
    completed_at: null,
    linked_event_id: form.linkedEventId,
  };

  const { data, error } = await requireSupabase()
    .from("quests")
    .insert(payload)
    .select()
    .single();

  if (error) throw error;
  const quest = rowToQuest(data as QuestRow);

  await insertQuestLog({
    questId: quest.id,
    questTitle: quest.title,
    action: "created",
    actorName,
  });

  return quest;
}

export async function updateQuestRecord(quest: Quest): Promise<Quest> {
  const { data, error } = await requireSupabase()
    .from("quests")
    .update(questToUpdatePayload(quest))
    .eq("id", quest.id)
    .select()
    .single();

  if (error) throw error;
  return rowToQuest(data as QuestRow);
}

export async function deleteQuestRecord(
  quest: Quest,
  actorName: string,
): Promise<void> {
  await insertQuestLog({
    questId: quest.id,
    questTitle: quest.title,
    action: "deleted",
    actorName,
  });

  const { error } = await requireSupabase()
    .from("quests")
    .delete()
    .eq("id", quest.id);

  if (error) throw error;
}

export async function acceptQuest(
  quest: Quest,
  playerName: string,
): Promise<Quest> {
  const hadNoParticipants = quest.participants.length === 0;
  const participants = addParticipant(quest, playerName);
  const next: Quest = {
    ...quest,
    participants,
    challenger: participants[0] ?? EMPTY_SLOT,
    successor1: participants[1] ?? EMPTY_SLOT,
    successor2: participants[2] ?? EMPTY_SLOT,
  };
  next.status = deriveStatusAfterRosterChange(next);
  const updated = await updateQuestRecord(next);

  if (hadNoParticipants && participants[0]) {
    await transferTaskToQuestParticipant(updated, participants[0]);
  }

  await insertQuestLog({
    questId: updated.id,
    questTitle: updated.title,
    action: "accepted",
    actorName: playerName,
  });

  return updated;
}

export async function becomeSuccessor(
  quest: Quest,
  playerName: string,
): Promise<Quest> {
  const hadNoParticipants = quest.participants.length === 0;
  const participants = addParticipant(quest, playerName);
  const next: Quest = {
    ...quest,
    participants,
    challenger: participants[0] ?? EMPTY_SLOT,
    successor1: participants[1] ?? EMPTY_SLOT,
    successor2: participants[2] ?? EMPTY_SLOT,
  };
  next.status = deriveStatusAfterRosterChange(next);
  const updated = await updateQuestRecord(next);

  if (hadNoParticipants && participants[0]) {
    await transferTaskToQuestParticipant(updated, participants[0]);
  }

  await insertQuestLog({
    questId: updated.id,
    questTitle: updated.title,
    action: "successor_added",
    actorName: playerName,
  });

  return updated;
}

export async function requestSuccession(
  quest: Quest,
  actorName: string,
): Promise<Quest> {
  const updated = await updateQuestRecord({
    ...quest,
    status: "help_wanted",
  });

  await insertQuestLog({
    questId: updated.id,
    questTitle: updated.title,
    action: "succession_requested",
    actorName,
  });

  return updated;
}

export async function completeQuestAndTask(
  quest: Quest,
  actorName: string,
): Promise<Quest> {
  const updated = await updateQuestRecord({
    ...quest,
    status: "completed",
    completedAt: new Date().toISOString(),
  });

  const baseExp = getQuestBaseExp(quest);
  await awardPlayerExp(
    quest.participants
      .map((name, index) => ({
        name,
        exp: index === 0 ? baseExp : Math.floor(baseExp * 0.6),
      }))
      .filter((award) => !isEmptySlot(award.name)),
  );

  await awardExpeditionTickets(
    actorName,
    getExpeditionTicketsForRank(getPriorityScore(quest)),
  );

  await insertQuestLog({
    questId: updated.id,
    questTitle: updated.title,
    action: "quest_completed_task_completed",
    actorName,
    details: `『${updated.title}』が討伐完了し、関連任務も完了しました。`,
  });

  await completeTaskLinkedToQuest(updated.id, actorName);

  return updated;
}

export const completeQuest = completeQuestAndTask;

export async function reopenQuest(
  quest: Quest,
  actorName: string,
  reason?: string,
): Promise<Quest> {
  const baseStatus =
    quest.participants.length <= 0
      ? "open"
      : quest.participants.length >= quest.requiredMembers
        ? "in_progress"
        : "recruiting";
  const reopened: Quest = {
    ...quest,
    status: deriveStatusAfterRosterChange({ ...quest, status: baseStatus }),
    completedAt: null,
  };
  const updated = await updateQuestRecord(reopened);

  await insertQuestLog({
    questId: updated.id,
    questTitle: updated.title,
    action: "reopened",
    actorName,
    details: reason,
  });

  return updated;
}

export async function editQuestFields(
  quest: Quest,
  form: QuestFormData,
  actorName: string,
): Promise<Quest> {
  const updated = await updateQuestRecord({
    ...quest,
    requester: form.requester,
    title: form.title,
    level: form.level,
    difficulty: form.difficulty ?? quest.difficulty,
    priority: form.priority,
    urgency: form.urgency,
    importance: form.importance,
    estimatedTime: form.estimatedTime,
    estimatedMinutes: form.estimatedMinutes ?? quest.estimatedMinutes,
    dueAt: form.dueAt ?? quest.dueAt,
    requiredMembers: form.requiredMembers ?? quest.requiredMembers,
    description: form.description,
    linkedEventId: form.linkedEventId,
  });

  await insertQuestLog({
    questId: updated.id,
    questTitle: updated.title,
    action: "edited",
    actorName,
  });

  return updated;
}

function addParticipant(quest: Quest, playerName: string): string[] {
  const next = quest.participants
    .map((name) => name.trim())
    .filter(Boolean);
  if (!next.includes(playerName) && next.length < quest.requiredMembers) {
    next.push(playerName);
  }
  return next.slice(0, quest.requiredMembers);
}
