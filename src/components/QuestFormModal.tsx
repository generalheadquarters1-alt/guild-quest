import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Priority, Quest, QuestLevel } from "../data/quests";

export interface QuestFormData {
  requester: string;
  title: string;
  level: QuestLevel;
  priority: Priority;
  urgency: number;
  importance: number;
  estimatedTime: string;
  description: string;
}

interface QuestFormModalProps {
  open: boolean;
  mode: "create" | "edit";
  initial?: Quest | null;
  onClose: () => void;
  onSubmit: (data: QuestFormData) => void;
  submitting?: boolean;
}

const LEVELS: QuestLevel[] = [
  "Novice",
  "Easy",
  "Normal",
  "Hard",
  "Legend",
];
const PRIORITIES: Priority[] = ["S", "A", "B", "C"];

const LEVEL_LABELS: Record<QuestLevel, string> = {
  Novice: "見習い",
  Easy: "易",
  Normal: "標準",
  Hard: "難",
  Legend: "伝説",
};

const EMPTY_FORM: QuestFormData = {
  requester: "",
  title: "",
  level: "Normal",
  priority: "B",
  urgency: 3,
  importance: 3,
  estimatedTime: "",
  description: "",
};

function questToForm(quest: Quest): QuestFormData {
  return {
    requester: quest.requester,
    title: quest.title,
    level: quest.level,
    priority: quest.priority,
    urgency: quest.urgency,
    importance: quest.importance,
    estimatedTime: quest.estimatedTime === "—" ? "" : quest.estimatedTime,
    description: quest.description,
  };
}

export function QuestFormModal({
  open,
  mode,
  initial,
  onClose,
  onSubmit,
  submitting = false,
}: QuestFormModalProps) {
  const [form, setForm] = useState<QuestFormData>(EMPTY_FORM);

  useEffect(() => {
    if (open) {
      setForm(mode === "edit" && initial ? questToForm(initial) : EMPTY_FORM);
    }
  }, [open, mode, initial]);

  if (!open) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (submitting || !form.requester.trim() || !form.title.trim()) return;
    onSubmit({
      ...form,
      requester: form.requester.trim(),
      title: form.title.trim(),
      estimatedTime: form.estimatedTime.trim() || "—",
      description: form.description.trim(),
    });
    if (mode === "create") setForm(EMPTY_FORM);
    onClose();
  };

  const update = <K extends keyof QuestFormData>(
    key: K,
    value: QuestFormData[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quest-form-title"
    >
      <button
        type="button"
        className="modal-backdrop absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label="閉じる"
        onClick={submitting ? undefined : onClose}
      />
      <div className="modal-panel relative rpg-frame rounded-t-2xl sm:rounded-xl w-full max-w-lg max-h-[92dvh] overflow-y-auto custom-scroll">
        <header className="sticky top-0 z-10 px-5 py-4 border-b border-[var(--color-gold)]/20 bg-[var(--color-panel)]/95 backdrop-blur-sm">
          <h2
            id="quest-form-title"
            className="text-xl font-bold gold-text"
          >
            {mode === "create" ? "✦ 新規クエスト" : "✎ クエスト編集"}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {mode === "create"
              ? "ギルドボードに新しい依頼を掲示します"
              : "掲示中のクエスト内容を更新します"}
          </p>
        </header>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <FormField label="依頼者" required>
            <input
              type="text"
              required
              disabled={submitting}
              value={form.requester}
              onChange={(e) => update("requester", e.target.value)}
              placeholder="例: 店長 · 佐藤"
              className="quest-input"
            />
          </FormField>

          <FormField label="クエスト名" required>
            <input
              type="text"
              required
              disabled={submitting}
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder="例: 返品棚の整理"
              className="quest-input"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Lv">
              <select
                value={form.level}
                onChange={(e) => update("level", e.target.value as QuestLevel)}
                disabled={submitting}
                className="quest-input"
              >
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {LEVEL_LABELS[l]}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="装飾ランク">
              <select
                value={form.priority}
                onChange={(e) => update("priority", e.target.value as Priority)}
                disabled={submitting}
                className="quest-input"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ScoreField
              label="緊急度"
              value={form.urgency}
              onChange={(value) => update("urgency", value)}
              disabled={submitting}
            />
            <ScoreField
              label="重要度"
              value={form.importance}
              onChange={(value) => update("importance", value)}
              disabled={submitting}
            />
          </div>
          <div className="rounded-lg border border-[var(--color-gold)]/20 bg-black/20 px-3 py-2 text-xs text-slate-400">
            依頼ランク:{" "}
            <span className="text-[var(--color-gold-bright)] font-bold">
              {form.urgency * form.importance}
            </span>
            <span className="ml-2 text-slate-500">
              緊急度 × 重要度で自動計算されます
            </span>
          </div>

          <FormField label="推定時間">
            <input
              type="text"
              value={form.estimatedTime}
              onChange={(e) => update("estimatedTime", e.target.value)}
              disabled={submitting}
              placeholder="例: 30分, 2h, 1日"
              className="quest-input"
            />
          </FormField>

          <FormField label="説明">
            <textarea
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              disabled={submitting}
              placeholder="担当者に伝えたい作業内容や注意点..."
              rows={4}
              className="quest-input resize-none"
            />
          </FormField>

          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="quest-btn-secondary flex-1 disabled:opacity-45"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="quest-btn-primary flex-1 disabled:opacity-45"
            >
              {submitting
                ? "掲示中..."
                : mode === "create"
                  ? "掲示する"
                  : "保存する"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[10px] tracking-wider text-[var(--color-gold-dim)]">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function ScoreField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] tracking-wider text-[var(--color-gold-dim)]">
          {label}
        </span>
        <span className="text-xs font-bold text-[var(--color-gold-bright)]">
          {value}
        </span>
      </div>
      <div className="mt-1.5 grid grid-cols-5 gap-1">
        {[1, 2, 3, 4, 5].map((score) => (
          <button
            key={score}
            type="button"
            disabled={disabled}
            onClick={() => onChange(score)}
            aria-label={`${label} ${score}`}
            className={`min-h-11 rounded-md border text-sm transition-all disabled:opacity-45 ${
              score <= value
                ? "border-[var(--color-gold)]/60 bg-[var(--color-gold)]/16 text-[var(--color-gold-bright)] shadow-[0_0_12px_rgba(212,168,83,0.16)]"
                : "border-white/10 bg-black/25 text-slate-600 hover:border-[var(--color-gold)]/35"
            }`}
          >
            ◆
          </button>
        ))}
      </div>
    </div>
  );
}
