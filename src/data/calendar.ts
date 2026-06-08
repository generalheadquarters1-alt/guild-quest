export type CalendarEventType =
  | "guild"
  | "personal"
  | "shift"
  | "deadline"
  | "memo";

export interface CalendarEvent {
  id: number;
  title: string;
  description: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  eventType: CalendarEventType;
  importance: number;
  ownerName: string;
  createdBy: string;
  linkedQuestId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarEventFormData {
  title: string;
  description: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  eventType: CalendarEventType;
  importance: number;
  ownerName: string;
  linkedQuestId: number | null;
}

export const EVENT_TYPE_LABELS: Record<CalendarEventType, string> = {
  guild: "ギルド予定",
  personal: "個人予定",
  shift: "シフト",
  deadline: "期限",
  memo: "メモ",
};

export const EVENT_TYPE_TONES: Record<CalendarEventType, string> = {
  guild: "calendar-tone-guild",
  personal: "calendar-tone-personal",
  shift: "calendar-tone-shift",
  deadline: "calendar-tone-deadline",
  memo: "calendar-tone-memo",
};

export const IMPORTANCE_LABELS: Record<number, string> = {
  1: "低",
  2: "やや低",
  3: "通常",
  4: "重要",
  5: "最重要",
};

export const EMPTY_EVENT_FORM: CalendarEventFormData = {
  title: "",
  description: "",
  eventDate: toDateInputValue(new Date()),
  startTime: "",
  endTime: "",
  eventType: "guild",
  importance: 3,
  ownerName: "",
  linkedQuestId: null,
};

export function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateInput(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

export function getMonthGrid(monthDate: Date) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      date,
      dateKey: toDateInputValue(date),
      inMonth: date.getMonth() === month,
      isToday: toDateInputValue(date) === toDateInputValue(new Date()),
    };
  });
}

export function getWeekRange(startDate = new Date()) {
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

export function isDateWithinRange(dateKey: string, start: Date, end: Date) {
  const time = parseDateInput(dateKey).getTime();
  return time >= start.getTime() && time <= end.getTime();
}

export function formatCalendarDate(dateKey: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(parseDateInput(dateKey));
}

export function formatCalendarMonth(date: Date) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
  }).format(date);
}

export function formatEventTime(event: Pick<CalendarEvent, "startTime" | "endTime">) {
  if (event.startTime && event.endTime) return `${event.startTime} - ${event.endTime}`;
  if (event.startTime) return `${event.startTime}開始`;
  if (event.endTime) return `${event.endTime}まで`;
  return "終日";
}

export function isPastDeadline(event: CalendarEvent, now = new Date()) {
  if (event.eventType !== "deadline") return false;
  const deadline = parseDateInput(event.eventDate);
  deadline.setHours(23, 59, 59, 999);
  return deadline.getTime() < now.getTime();
}

export function daysUntil(dateKey: string, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = parseDateInput(dateKey);
  return Math.ceil((target.getTime() - start.getTime()) / 86_400_000);
}

export function eventToForm(event: CalendarEvent): CalendarEventFormData {
  return {
    title: event.title,
    description: event.description,
    eventDate: event.eventDate,
    startTime: event.startTime,
    endTime: event.endTime,
    eventType: event.eventType,
    importance: event.importance,
    ownerName: event.ownerName,
    linkedQuestId: event.linkedQuestId,
  };
}
