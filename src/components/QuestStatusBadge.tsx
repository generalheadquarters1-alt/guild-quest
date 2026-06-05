import type { QuestStatus } from "../data/quests";

const CONFIG: Record<
  QuestStatus,
  { label: string; className: string }
> = {
  open: {
    label: "◆ 未受注",
    className:
      "border-[var(--color-gold)]/60 text-[var(--color-gold-bright)] bg-[var(--color-gold)]/12 shadow-[0_0_14px_rgba(212,168,83,0.14)]",
  },
  in_progress: {
    label: "⚡ 挑戦中",
    className:
      "border-[var(--color-mana)]/50 text-[var(--color-mana)] bg-[var(--color-mana)]/10",
  },
  succession_needed: {
    label: "🔗 継承募集",
    className:
      "border-[var(--color-rare)]/55 text-[var(--color-rare)] bg-[var(--color-rare)]/12 shadow-[0_0_14px_rgba(206,147,216,0.12)]",
  },
  completed: {
    label: "✓ 達成",
    className:
      "border-[var(--color-xp)]/40 text-[var(--color-xp)] bg-[var(--color-xp)]/10",
  },
};

export function QuestStatusBadge({ status }: { status: QuestStatus }) {
  const { label, className } = CONFIG[status];
  return (
    <span
      className={`text-[10px] px-2 py-1 rounded border tracking-wider whitespace-nowrap ${className}`}
    >
      {label}
    </span>
  );
}
