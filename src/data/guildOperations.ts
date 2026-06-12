import type { AdventurerTask } from "./adventurerTasks";
import { daysUntil } from "./calendar";

export type GuildNoticeType =
  | "deadline_warning"
  | "overdue"
  | "missing_task"
  | "suggestion"
  | "system";

export type GuildRequestType = "suggestion" | "assignment" | "directive";
export type GuildRequestStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "completed";

export interface GuildNotice {
  id: number;
  type: GuildNoticeType;
  title: string;
  message: string;
  targetPlayer: string;
  relatedTaskId: number | null;
  relatedQuestId: number | null;
  createdAt: string;
  dismissed: boolean;
}

export interface GuildRequest {
  id: number;
  requestType: GuildRequestType;
  fromPlayer: string;
  toPlayer: string;
  taskTitle: string;
  taskDescription: string;
  status: GuildRequestStatus;
  priority: number;
  importance: number;
  dueDate: string;
  calendarEventId: number | null;
  relatedTaskId: number | null;
  createdAt: string;
  respondedAt: string | null;
}

export interface GuildRequestFormData {
  requestType: GuildRequestType;
  toPlayer: string;
  taskTitle: string;
  taskDescription: string;
  priority: number;
  importance: number;
  dueDate: string;
  calendarEventId: number | null;
}

export const NOTICE_TYPE_LABELS: Record<GuildNoticeType, string> = {
  deadline_warning: "納期警告",
  overdue: "期限超過",
  missing_task: "速報",
  suggestion: "助言",
  system: "システム",
};

export const REQUEST_TYPE_LABELS: Record<GuildRequestType, string> = {
  suggestion: "助言",
  assignment: "指名依頼",
  directive: "ギルド指令",
};

export const REQUEST_STATUS_LABELS: Record<GuildRequestStatus, string> = {
  pending: "未対応",
  accepted: "承認",
  rejected: "却下",
  completed: "完了",
};

export function canIssueDirective(roleLevel: string | undefined) {
  return roleLevel === "sub_master" || roleLevel === "guild_master";
}

export function getRequestTone(type: GuildRequestType) {
  if (type === "directive") return "directive";
  if (type === "assignment") return "assignment";
  return "suggestion";
}

export function getDeadlineWarningLevel(task: AdventurerTask, now = new Date()) {
  if (!task.dueDate || task.status === "completed") return null;
  const days = daysUntil(task.dueDate, now);
  if (days < 0) return "overdue" as const;
  if (days > 0) return null;

  const deadline = new Date(task.dueDate);
  deadline.setHours(23, 59, 59, 999);
  const hours = Math.max(0, (deadline.getTime() - now.getTime()) / 3_600_000);
  if (hours <= 3) return "within3h" as const;
  if (hours <= 12) return "within12h" as const;
  return "within24h" as const;
}

export function getDeadlineNoticeCopy(task: AdventurerTask, now = new Date()) {
  const level = getDeadlineWarningLevel(task, now);
  if (!level) return null;

  if (level === "overdue") {
    return {
      type: "overdue" as GuildNoticeType,
      title: `${task.title} が期限を過ぎています`,
      message: `${task.ownerName}さんの任務「${task.title}」が未完了です。`,
    };
  }

  const title =
    level === "within3h"
      ? `${task.title} の納期が目前です`
      : level === "within12h"
        ? `${task.title} の納期が迫っています`
        : `${task.title} が近づいています`;

  return {
    type: "deadline_warning" as GuildNoticeType,
    title,
    message: `${task.ownerName}さんの納期が迫っています。必要なら助言や依頼で支援してください。`,
  };
}
