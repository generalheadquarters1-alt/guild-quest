import type { CompletedQuestEntry } from "../data/quests";
import { formatCompletedDate } from "../lib/questUtils";
import { LevelBadge } from "./LevelBadge";
import { PriorityBadge } from "./PriorityBadge";
import { QuestSecondaryActions } from "./QuestSecondaryActions";

interface CompletedQuestLogProps {
  entries: CompletedQuestEntry[];
  onReopen: (questId: number) => void;
  onDelete: (questId: number) => void;
}

export function CompletedQuestLog({
  entries,
  onReopen,
  onDelete,
}: CompletedQuestLogProps) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-slate-500 text-center py-6">
        まだ達成したクエストはありません。
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {entries.map((entry) => (
        <li
          key={entry.quest.id}
          className="rounded-lg border border-white/5 bg-black/25 px-3 py-3 sm:px-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-2 gap-y-1">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-200 leading-snug">
                {entry.quest.title}
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5 truncate">
                {entry.quest.requester} · {formatCompletedDate(entry.completedAt)}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <LevelBadge level={entry.quest.level} />
              <PriorityBadge priority={entry.quest.priority} />
            </div>
          </div>
          <p className="text-[10px] text-slate-500 mt-2">
            挑戦者:{" "}
            <span className="text-slate-400">{entry.quest.challenger}</span>
          </p>
          <QuestSecondaryActions
            className="mt-2"
            onReopen={() => onReopen(entry.quest.id)}
            onDelete={() => onDelete(entry.quest.id)}
            showReopen
          />
        </li>
      ))}
    </ul>
  );
}
