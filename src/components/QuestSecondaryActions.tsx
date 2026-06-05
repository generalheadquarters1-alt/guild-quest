import type { ReactNode } from "react";

interface QuestSecondaryActionsProps {
  onEdit?: () => void;
  onDelete?: () => void;
  onReopen?: () => void;
  showReopen?: boolean;
  className?: string;
  disabled?: boolean;
}

export function QuestSecondaryActions({
  onEdit,
  onDelete,
  onReopen,
  showReopen,
  className = "",
  disabled = false,
}: QuestSecondaryActionsProps) {
  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${className}`}
      role="group"
      aria-label="クエスト管理"
    >
      {onEdit && (
        <SecondaryButton onClick={onEdit} disabled={disabled}>
          編集
        </SecondaryButton>
      )}
      {showReopen && onReopen && (
        <SecondaryButton onClick={onReopen} disabled={disabled}>
          再掲
        </SecondaryButton>
      )}
      {onDelete && (
        <SecondaryButton onClick={onDelete} variant="danger" disabled={disabled}>
          削除
        </SecondaryButton>
      )}
    </div>
  );
}

function SecondaryButton({
  children,
  onClick,
  variant = "default",
  disabled = false,
}: {
  children: ReactNode;
  onClick: () => void;
  variant?: "default" | "danger";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-h-11 px-3 text-[11px] border-2 shadow-[2px_2px_0_#000] transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
        variant === "danger"
          ? "border-red-900/45 bg-red-950/10 text-red-900 hover:text-red-700"
          : "border-stone-700/45 bg-stone-900/10 text-stone-800 hover:text-stone-950"
      }`}
    >
      {children}
    </button>
  );
}
