import { LOG_ACTION_LABELS, type QuestLog } from "../lib/questLogApi";
import { formatCompletedDate } from "../lib/questUtils";

interface ActivityLogProps {
  logs: QuestLog[];
  loading: boolean;
}

export function ActivityLog({ logs, loading }: ActivityLogProps) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 rounded bg-white/5 animate-pulse" />
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
          className="text-[11px] sm:text-xs leading-snug px-2 py-2 rounded border border-white/5 bg-black/20"
        >
          <span className="text-slate-500 tabular-nums">
            {formatCompletedDate(log.createdAt)}
          </span>
          <span className="text-slate-600 mx-1">·</span>
          {log.actorName ? (
            <span className="text-[var(--color-gold-bright)]/90">
              {log.actorName}
            </span>
          ) : (
            <span className="text-slate-500">ギルド</span>
          )}{" "}
          <span className="text-slate-300">
            {LOG_ACTION_LABELS[log.action] ?? log.action}
          </span>
          <span className="text-slate-500"> — </span>
          <span className="text-slate-400">{log.questTitle}</span>
          {log.details && (
            <p className="text-slate-500 mt-1 pl-0 italic">&ldquo;{log.details}&rdquo;</p>
          )}
        </li>
      ))}
    </ul>
  );
}
