export function SuccessorWantedBadge() {
  return (
    <span className="successor-wanted-badge inline-flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full border border-[var(--color-rare)]/60 font-bold uppercase tracking-wider whitespace-nowrap">
      <span className="successor-wanted-dot" aria-hidden />
      継承募集
    </span>
  );
}
