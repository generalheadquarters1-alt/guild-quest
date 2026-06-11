import {
  daysUntil,
  parseDateInput,
  toDateInputValue,
} from "./calendar";

export type AdventurerTaskStatus =
  | "todo"
  | "in_progress"
  | "completed"
  | "delegated";

export type AdventurerTaskTab = "today" | "week" | "month" | "future";

export interface AdventurerTask {
  id: number;
  ownerName: string;
  title: string;
  description: string;
  status: AdventurerTaskStatus;
  priority: number;
  importance: number;
  dueDate: string | null;
  calendarEventId: number | null;
  isPublic: boolean;
  questId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdventurerTaskFormData {
  title: string;
  description: string;
  priority: number;
  importance: number;
  dueDate: string;
  calendarEventId: number | null;
  isPublic: boolean;
}

export const EMPTY_TASK_FORM: AdventurerTaskFormData = {
  title: "",
  description: "",
  priority: 3,
  importance: 3,
  dueDate: "",
  calendarEventId: null,
  isPublic: false,
};

export const TASK_STATUS_LABELS: Record<AdventurerTaskStatus, string> = {
  todo: "未着手",
  in_progress: "進行中",
  completed: "完了",
  delegated: "依頼中",
};

export const TASK_TAB_LABELS: Record<AdventurerTaskTab, string> = {
  today: "今日",
  week: "今週",
  month: "今月",
  future: "未来",
};

export function taskToForm(task: AdventurerTask): AdventurerTaskFormData {
  return {
    title: task.title,
    description: task.description,
    priority: task.priority,
    importance: task.importance,
    dueDate: task.dueDate ?? "",
    calendarEventId: task.calendarEventId,
    isPublic: task.isPublic,
  };
}

export function getTaskScore(task: Pick<AdventurerTask, "priority" | "importance">) {
  return task.priority * task.importance;
}

export function getTaskBaseExp(task: Pick<AdventurerTask, "priority" | "importance">) {
  return getTaskScore(task) * 10;
}

export function getTaskDueTone(task: AdventurerTask, now = new Date()) {
  if (!task.dueDate) return "none" as const;
  const days = daysUntil(task.dueDate, now);
  if (days < 0) return "overdue" as const;
  if (days === 0) return "today" as const;
  if (days <= 7) return "soon" as const;
  return "future" as const;
}

export function getTaskDueLabel(task: AdventurerTask, now = new Date()) {
  if (!task.dueDate) return "納期なし";
  const days = daysUntil(task.dueDate, now);
  if (days < 0) return `期限切れ ${Math.abs(days)}日`;
  if (days === 0) return "本日納期";
  if (days <= 7) return `納期まで${days}日`;
  return task.dueDate.replaceAll("-", "/");
}

export function getTaskTab(task: AdventurerTask, now = new Date()): AdventurerTaskTab {
  if (!task.dueDate) return "today";
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const date = parseDateInput(task.dueDate);
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + 6);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  if (date.getTime() <= today.getTime()) return "today";
  if (date.getTime() <= weekEnd.getTime()) return "week";
  if (date.getTime() <= monthEnd.getTime()) return "month";
  return "future";
}

export function filterTasksByTab(
  tasks: AdventurerTask[],
  tab: AdventurerTaskTab,
  now = new Date(),
) {
  return tasks.filter((task) => getTaskTab(task, now) === tab);
}

export function sortTasks(tasks: AdventurerTask[]) {
  return [...tasks].sort((a, b) => {
    const dueWeight = taskDuePriority(b) - taskDuePriority(a);
    if (dueWeight !== 0) return dueWeight;
    const byPriority = b.priority - a.priority;
    if (byPriority !== 0) return byPriority;
    const byImportance = b.importance - a.importance;
    if (byImportance !== 0) return byImportance;
    const aDue = a.dueDate ?? "9999-12-31";
    const bDue = b.dueDate ?? "9999-12-31";
    const byDue = aDue.localeCompare(bDue);
    if (byDue !== 0) return byDue;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export function getTodayKey() {
  return toDateInputValue(new Date());
}

function taskDuePriority(task: AdventurerTask) {
  const tone = getTaskDueTone(task);
  if (tone === "overdue") return 5;
  if (tone === "today") return 4;
  if (tone === "soon") return 3;
  if (task.status === "delegated") return 2;
  return 1;
}
