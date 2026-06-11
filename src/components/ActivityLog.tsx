import type { QuestLog, QuestLogAction } from "../lib/questLogApi";
import { formatCompletedDate } from "../lib/questUtils";

const ACTION_SENTENCE: Record<QuestLogAction, string> = {
  created: "を掲示しました。",
  accepted: "を受注しました。",
  succession_requested: "の助っ人を募集しました。",
  successor_added: "を継承しました。",
  completed: "を達成しました。",
  edited: "を書き換えました。",
  deleted: "を記録から外しました。",
  reopened: "を再掲しました。",
  expedition_started: "へ出発しました。",
  expedition_claimed: "から帰還しました。",
  calendar_event_created: "をギルド暦に追加しました。",
  calendar_event_updated: "を更新しました。",
  calendar_event_deleted: "を削除しました。",
  quest_linked_event: "を予定と関連付けました。",
  task_created: "を手帳に記しました。",
  task_updated: "を書き換えました。",
  task_deleted: "を手帳から外しました。",
  task_delegated: "をギルドへ依頼しました。",
  task_completed: "を達成しました。",
  guild_suggestion_sent: "の助言を送りました。",
  guild_assignment_sent: "を指名依頼しました。",
  guild_directive_issued: "のギルド指令を発令しました。",
  guild_request_accepted: "を承認しました。",
  guild_request_rejected: "を却下しました。",
};

interface ActivityLogProps {
  logs: QuestLog[];
  loading: boolean;
}

export function ActivityLog({ logs, loading }: ActivityLogProps) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 border-2 border-white/15 bg-white/5 animate-pulse shadow-[2px_2px_0_#000]" />
        ))}
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <p className="text-sm text-slate-500 text-center py-4">
        まだギルド活動はありません。
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1.5 max-h-56 overflow-y-auto custom-scroll">
      {logs.map((log) => (
        <li
          key={log.id}
          className="text-[11px] sm:text-xs leading-snug px-2 py-2 border-2 border-white/15 bg-black/20 shadow-[2px_2px_0_#000]"
        >
          <span className="text-slate-500 tabular-nums">
            {formatCompletedDate(log.createdAt)}
          </span>
          <span className="text-slate-600 mx-1">·</span>
          <span className="text-[var(--color-gold-bright)]/90">
            {log.actorName || "ギルド"}
          </span>
          <span className="text-slate-400">が </span>
          <span className="text-slate-100">
            「{log.questTitle}」
          </span>
          <span className="text-slate-300">
            {ACTION_SENTENCE[log.action] ?? "を記録しました。"}
          </span>
          {log.details && (
            <p className="text-slate-500 mt-1 pl-0 italic">&ldquo;{log.details}&rdquo;</p>
          )}
        </li>
      ))}
    </ul>
  );
}
