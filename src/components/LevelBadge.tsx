import type { QuestLevel } from "../data/quests";

const STYLES: Record<QuestLevel, string> = {
  Novice: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
  Easy: "text-teal-400 border-teal-500/40 bg-teal-500/10",
  Normal: "text-sky-400 border-sky-500/40 bg-sky-500/10",
  Hard: "text-violet-400 border-violet-500/40 bg-violet-500/10",
  Legend:
    "text-amber-300 border-amber-500/50 bg-amber-500/15 shadow-[0_0_16px_rgba(245,158,11,0.2)]",
};

const LABELS: Record<QuestLevel, string> = {
  Novice: "見習い",
  Easy: "易",
  Normal: "標準",
  Hard: "難",
  Legend: "伝説",
};

export function LevelBadge({ level }: { level: QuestLevel }) {
  return (
    <span
      className={`pixel-chip inline-flex px-2 py-0.5 text-[10px] sm:text-xs font-semibold uppercase tracking-wider ${STYLES[level]}`}
    >
      Lv {LABELS[level]}
    </span>
  );
}
