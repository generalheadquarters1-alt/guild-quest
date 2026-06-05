import type { Priority } from "../data/quests";

const STYLES: Record<Priority, string> = {
  S: "bg-red-500/20 text-red-300 border-red-400/50 shadow-[0_0_12px_rgba(239,68,68,0.3)]",
  A: "bg-orange-500/20 text-orange-300 border-orange-400/50",
  B: "bg-blue-500/20 text-blue-300 border-blue-400/50",
  C: "bg-slate-500/20 text-slate-300 border-slate-400/50",
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span
      className={`pixel-chip inline-flex items-center justify-center min-w-[1.75rem] px-1.5 py-0.5 text-xs font-bold ${STYLES[priority]}`}
    >
      {priority} Rank
    </span>
  );
}
