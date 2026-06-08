import type {
  CalendarEvent,
  CalendarEventFormData,
  CalendarEventType,
} from "../data/calendar";
import { insertQuestLog } from "./questLogApi";
import { requireSupabase } from "./supabase";

export interface CalendarEventRow {
  id: number;
  title: string;
  description: string | null;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  event_type: string;
  importance: number;
  owner_name: string | null;
  created_by: string | null;
  linked_quest_id: number | null;
  created_at: string;
  updated_at: string;
}

const EVENT_TYPES: CalendarEventType[] = [
  "guild",
  "personal",
  "shift",
  "deadline",
  "memo",
];

function parseEventType(value: string): CalendarEventType {
  return EVENT_TYPES.includes(value as CalendarEventType)
    ? (value as CalendarEventType)
    : "guild";
}

function cleanTime(value: string | null | undefined) {
  if (!value) return "";
  return value.slice(0, 5);
}

export function rowToCalendarEvent(row: CalendarEventRow): CalendarEvent {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    eventDate: row.event_date,
    startTime: cleanTime(row.start_time),
    endTime: cleanTime(row.end_time),
    eventType: parseEventType(row.event_type),
    importance: Math.min(5, Math.max(1, Math.round(row.importance ?? 3))),
    ownerName: row.owner_name ?? "",
    createdBy: row.created_by ?? "",
    linkedQuestId: row.linked_quest_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchCalendarEvents(): Promise<CalendarEvent[]> {
  const { data, error } = await requireSupabase()
    .from("calendar_events")
    .select("*")
    .order("event_date", { ascending: true })
    .order("start_time", { ascending: true, nullsFirst: true });

  if (error) throw error;
  return (data as CalendarEventRow[]).map(rowToCalendarEvent);
}

export async function createCalendarEvent(
  form: CalendarEventFormData,
  actorName: string,
): Promise<CalendarEvent> {
  const { data, error } = await requireSupabase()
    .from("calendar_events")
    .insert(toPayload(form, actorName))
    .select("*")
    .single();

  if (error) throw error;
  const event = rowToCalendarEvent(data as CalendarEventRow);

  await syncLinkedQuest(event.id, form.linkedQuestId);
  await insertQuestLog({
    questId: form.linkedQuestId,
    questTitle: event.title,
    action: "calendar_event_created",
    actorName,
  });

  return event;
}

export async function updateCalendarEvent(
  eventId: number,
  form: CalendarEventFormData,
  actorName: string,
): Promise<CalendarEvent> {
  const { data, error } = await requireSupabase()
    .from("calendar_events")
    .update(toPayload(form, actorName))
    .eq("id", eventId)
    .select("*")
    .single();

  if (error) throw error;
  const event = rowToCalendarEvent(data as CalendarEventRow);

  await syncLinkedQuest(event.id, form.linkedQuestId);
  await insertQuestLog({
    questId: form.linkedQuestId,
    questTitle: event.title,
    action: "calendar_event_updated",
    actorName,
  });

  return event;
}

export async function deleteCalendarEvent(
  event: CalendarEvent,
  actorName: string,
): Promise<void> {
  const { error: unlinkError } = await requireSupabase()
    .from("quests")
    .update({ linked_event_id: null })
    .eq("linked_event_id", event.id);

  if (unlinkError) throw unlinkError;

  await insertQuestLog({
    questId: event.linkedQuestId,
    questTitle: event.title,
    action: "calendar_event_deleted",
    actorName,
  });

  const { error } = await requireSupabase()
    .from("calendar_events")
    .delete()
    .eq("id", event.id);

  if (error) throw error;
}

export async function linkQuestToCalendarEvent(
  questId: number,
  eventId: number | null,
  actorName: string,
  questTitle: string,
): Promise<void> {
  const { error } = await requireSupabase()
    .from("quests")
    .update({ linked_event_id: eventId })
    .eq("id", questId);

  if (error) throw error;

  await insertQuestLog({
    questId,
    questTitle,
    action: "quest_linked_event",
    actorName,
  });
}

function toPayload(form: CalendarEventFormData, actorName: string) {
  return {
    title: form.title.trim(),
    description: form.description.trim() || null,
    event_date: form.eventDate,
    start_time: form.startTime || null,
    end_time: form.endTime || null,
    event_type: form.eventType,
    importance: form.importance,
    owner_name: form.eventType === "personal" ? form.ownerName || null : form.ownerName || null,
    created_by: actorName || null,
    linked_quest_id: form.linkedQuestId,
    updated_at: new Date().toISOString(),
  };
}

async function syncLinkedQuest(eventId: number, questId: number | null) {
  if (questId == null) return;

  const { error } = await requireSupabase()
    .from("quests")
    .update({ linked_event_id: eventId })
    .eq("id", questId);

  if (error) throw error;
}
