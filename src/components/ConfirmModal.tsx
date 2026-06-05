interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "gold";
  onConfirm: () => void;
  onCancel: () => void;
  disabled?: boolean;
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "実行",
  cancelLabel = "キャンセル",
  variant = "gold",
  onConfirm,
  onCancel,
  disabled = false,
}: ConfirmModalProps) {
  if (!open) return null;

  const confirmClass =
    variant === "danger"
      ? "border-red-400/50 text-red-200 hover:bg-red-500/15"
      : "quest-btn-primary !text-[var(--color-void)]";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <button
        type="button"
        className="modal-backdrop absolute inset-0 bg-black/75 backdrop-blur-sm"
        aria-label="キャンセル"
        onClick={disabled ? undefined : onCancel}
      />
      <div className="modal-panel relative rpg-frame rounded-xl w-full max-w-sm p-5">
        <h2
          id="confirm-title"
          className="text-lg font-bold gold-text"
        >
          {title}
        </h2>
        <p className="text-sm text-slate-400 mt-2 leading-relaxed">{message}</p>
        <div className="flex flex-col-reverse sm:flex-row gap-2 mt-5">
          <button
            type="button"
            onClick={onCancel}
            disabled={disabled}
            className="quest-btn-secondary flex-1 disabled:opacity-45"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={disabled}
            className={`flex-1 min-h-11 px-4 py-2 text-sm font-semibold rounded border transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
