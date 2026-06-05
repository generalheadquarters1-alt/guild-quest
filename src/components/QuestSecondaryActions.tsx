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
      className={`min-h-11 px-2 text-[11px] underline-offset-2 hover:underline transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
        variant === "danger"
          ? "text-slate-500 hover:text-red-400/90"
          : "text-slate-500 hover:text-slate-300"
      }`}
    >
      {children}
    </button>
  );
}
