import { useEffect, useState, type FormEvent } from "react";
import type { Quest } from "../data/quests";

interface ReopenQuestModalProps {
  open: boolean;
  quest: Quest | null;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  disabled?: boolean;
}

export function ReopenQuestModal({
  open,
  quest,
  onClose,
  onConfirm,
  disabled = false,
}: ReopenQuestModalProps) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) setReason("");
  }, [open, quest?.id]);

  if (!open || !quest) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (disabled) return;
    onConfirm(reason.trim());
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reopen-title"
    >
      <button
        type="button"
        className="modal-backdrop absolute inset-0 bg-black/75 backdrop-blur-sm"
        aria-label="閉じる"
        onClick={disabled ? undefined : onClose}
      />
      <div className="modal-panel relative rpg-frame rounded-t-2xl sm:rounded-xl w-full max-w-md">
        <header className="px-5 py-4 border-b border-[var(--color-gold)]/20">
          <h2
            id="reopen-title"
            className="text-lg font-bold gold-text"
          >
            ↻ クエスト再掲
          </h2>
          <p className="text-xs text-slate-400 mt-1 line-clamp-2">{quest.title}</p>
        </header>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <label className="block">
            <span className="text-[10px] tracking-wider text-[var(--color-gold-dim)]">
              理由（任意）
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={disabled}
              placeholder="再掲する理由や補足があれば入力してください"
              rows={3}
              className="quest-input resize-none mt-1.5"
            />
          </label>
          <div className="flex flex-col-reverse sm:flex-row gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={disabled}
              className="quest-btn-secondary flex-1 disabled:opacity-45"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={disabled}
              className="quest-btn-primary flex-1 disabled:opacity-45"
            >
              ボードに再掲
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
