import type { QuestStatus } from "../data/quests";

const CONFIG: Record<
  QuestStatus,
  { label: string; className: string }
> = {
  open: {
    label: "◆ 未受注",
    className:
      "border-slate-400/55 text-slate-200 bg-slate-500/10",
  },
  recruiting: {
    label: "◆ 募集中",
    className:
      "border-[var(--color-mana)]/55 text-[var(--color-mana)] bg-[var(--color-mana)]/10",
  },
  in_progress: {
    label: "⚡ 挑戦中",
    className:
      "border-amber-300/60 text-amber-100 bg-amber-400/12",
  },
  help_wanted: {
    label: "🔗 助っ人募集",
    className:
      "border-[var(--color-rare)]/55 text-[var(--color-rare)] bg-[var(--color-rare)]/12 shadow-[0_0_14px_rgba(206,147,216,0.12)]",
  },
  completed: {
    label: "✓ 達成",
    className:
      "border-[var(--color-xp)]/40 text-[var(--color-xp)] bg-[var(--color-xp)]/10",
  },
};

export function QuestStatusBadge({
  status,
  overdue = false,
}: {
  status: QuestStatus;
  overdue?: boolean;
}) {
  const { label, className } = CONFIG[status];
  if (overdue && status !== "completed") {
    return (
      <span className="quest-status-badge quest-overdue-badge pixel-chip text-[10px] px-2 py-1 tracking-wider whitespace-nowrap border-red-400/80 text-red-100 bg-red-500/18">
        ! 期限超過
      </span>
    );
  }
  return (
    <span
      className={`quest-status-badge pixel-chip text-[10px] px-2 py-1 tracking-wider whitespace-nowrap ${className}`}
    >
      {label}
    </span>
  );
}
