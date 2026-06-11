import type { QuestFormData } from "../components/QuestFormModal";
import { getExpeditionTicketsForRank } from "../data/expeditions";
import { EMPTY_SLOT, type Quest } from "../data/quests";
import { awardExpeditionTickets } from "./expeditionApi";
import { completeTaskLinkedToQuest } from "./adventurerTaskApi";
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
  const next: Quest = {
    ...quest,
    challenger: playerName,
  };
  next.status = deriveStatusAfterRosterChange(next);
  const updated = await updateQuestRecord(next);

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
  let next = { ...quest };
  if (next.successor1 === EMPTY_SLOT) {
    next = { ...next, successor1: playerName };
  } else if (next.successor2 === EMPTY_SLOT) {
    next = { ...next, successor2: playerName };
  }
  next.status = deriveStatusAfterRosterChange(next);
  const updated = await updateQuestRecord(next);

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
    status: "succession_needed",
  });

  await insertQuestLog({
    questId: updated.id,
    questTitle: updated.title,
    action: "succession_requested",
    actorName,
  });

  return updated;
}

export async function completeQuest(
  quest: Quest,
  actorName: string,
): Promise<Quest> {
  const updated = await updateQuestRecord({
    ...quest,
    status: "completed",
    completedAt: new Date().toISOString(),
  });

  const baseExp = getQuestBaseExp(quest);
  await awardPlayerExp([
    { name: quest.challenger, exp: baseExp },
    { name: quest.successor1, exp: Math.floor(baseExp * 0.6) },
    { name: quest.successor2, exp: Math.floor(baseExp * 0.6) },
  ].filter((award) => !isEmptySlot(award.name)));

  await awardExpeditionTickets(
    actorName,
    getExpeditionTicketsForRank(getPriorityScore(quest)),
  );

  await insertQuestLog({
    questId: updated.id,
    questTitle: updated.title,
    action: "completed",
    actorName,
  });

  await completeTaskLinkedToQuest(updated.id, actorName);

  return updated;
}

export async function reopenQuest(
  quest: Quest,
  actorName: string,
  reason?: string,
): Promise<Quest> {
  const reopened: Quest = {
    ...quest,
    status: deriveStatusAfterRosterChange(quest),
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
    priority: form.priority,
    urgency: form.urgency,
    importance: form.importance,
    estimatedTime: form.estimatedTime,
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
