import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { AvatarSprite } from "./AvatarSprite";
import {
  EVENT_TYPE_LABELS,
  formatCalendarDate,
  formatEventTime,
  type CalendarEvent,
} from "../data/calendar";
import type { PartyMember, Priority, Quest, QuestLevel } from "../data/quests";
import {
  ESTIMATED_MINUTE_OPTIONS,
  QUEST_DIFFICULTY_LABELS,
  QUEST_LEVEL_BY_DIFFICULTY,
  type QuestDifficulty,
} from "../data/quests";

export interface QuestFormData {
  requester: string;
  title: string;
  level: QuestLevel;
  difficulty: QuestDifficulty;
  priority: Priority;
  urgency: number;
  importance: number;
  estimatedTime: string;
  estimatedMinutes: number | null;
  dueAt: string | null;
  requiredMembers: number;
  description: string;
  linkedEventId: number | null;
}

interface QuestFormModalProps {
  open: boolean;
  mode: "create" | "edit";
  initial?: Quest | null;
  staff: PartyMember[];
  selectedPlayer: string;
  calendarEvents: CalendarEvent[];
  onClose: () => void;
  onSubmit: (data: QuestFormData) => void;
  submitting?: boolean;
}

const DIFFICULTIES: QuestDifficulty[] = [1, 2, 3, 4, 5];

const EMPTY_FORM: QuestFormData = {
  requester: "",
  title: "",
  level: "Normal",
  difficulty: 3,
  priority: "B",
  urgency: 3,
  importance: 3,
  estimatedTime: "",
  estimatedMinutes: 30,
  dueAt: null,
  requiredMembers: 1,
  description: "",
  linkedEventId: null,
};

function questToForm(quest: Quest): QuestFormData {
  return {
    requester: quest.requester,
    title: quest.title,
    level: quest.level,
    difficulty: quest.difficulty,
    priority: quest.priority,
    urgency: quest.urgency,
    importance: quest.importance,
    estimatedTime: quest.estimatedTime === "—" ? "" : quest.estimatedTime,
    estimatedMinutes: quest.estimatedMinutes,
    dueAt: quest.dueAt,
    requiredMembers: quest.requiredMembers,
    description: quest.description,
    linkedEventId: quest.linkedEventId ?? null,
  };
}

export function QuestFormModal({
  open,
  mode,
  initial,
  staff,
  selectedPlayer,
  calendarEvents,
  onClose,
  onSubmit,
  submitting = false,
}: QuestFormModalProps) {
  const [form, setForm] = useState<QuestFormData>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const activeStaff = useMemo(
    () => staff.filter((member) => member.isActive !== false),
    [staff],
  );

  const defaultRequester = useMemo(() => {
    return activeStaff.some((member) => member.name === selectedPlayer)
      ? selectedPlayer
      : "";
  }, [activeStaff, selectedPlayer]);

  const eventOptions = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return [...calendarEvents].sort((a, b) => {
      const aFuture = a.eventDate >= today ? 0 : 1;
      const bFuture = b.eventDate >= today ? 0 : 1;
      if (aFuture !== bFuture) return aFuture - bFuture;
      const byDate = a.eventDate.localeCompare(b.eventDate);
      if (byDate !== 0) return byDate;
      return (a.startTime || "99:99").localeCompare(b.startTime || "99:99");
    });
  }, [calendarEvents]);

  useEffect(() => {
    if (open) {
      setForm(
        mode === "edit" && initial
          ? questToForm(initial)
          : { ...EMPTY_FORM, requester: defaultRequester },
      );
      setError(null);
    }
  }, [open, mode, initial]);

  useEffect(() => {
    if (!open || mode !== "create" || form.requester || !defaultRequester) {
      return;
    }
    setForm((prev) => ({ ...prev, requester: defaultRequester }));
  }, [open, mode, form.requester, defaultRequester]);

  if (!open) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!form.requester.trim()) {
      setError("依頼者を選択してください");
      return;
    }
    if (!form.title.trim()) {
      setError("クエスト名を入力してください");
      return;
    }
    onSubmit({
      ...form,
      requester: form.requester.trim(),
      title: form.title.trim(),
      level: QUEST_LEVEL_BY_DIFFICULTY[form.difficulty],
      priority: priorityFromScores(form.urgency, form.importance),
      estimatedTime:
        (ESTIMATED_MINUTE_OPTIONS.find(
          (option) => option.value === form.estimatedMinutes,
        )?.label ??
          form.estimatedTime.trim()) ||
        "—",
      dueAt: form.dueAt,
      description: form.description.trim(),
    });
    if (mode === "create") setForm(EMPTY_FORM);
    onClose();
  };

  const update = <K extends keyof QuestFormData>(
    key: K,
    value: QuestFormData[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (error) setError(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quest-form-title"
    >
      <button
        type="button"
        className="modal-backdrop absolute inset-0 bg-black/80"
        aria-label="閉じる"
        onClick={submitting ? undefined : onClose}
      />
      <div className="modal-panel relative rpg-frame w-full max-w-lg max-h-[92dvh] overflow-y-auto custom-scroll">
        <header className="sticky top-0 z-10 px-5 py-4 border-b-2 border-[var(--color-gold)]/35 bg-[var(--color-panel)]">
          <h2
            id="quest-form-title"
            className="pixel-window-title text-xl font-bold"
          >
            {mode === "create" ? "依頼書を掲示" : "依頼書編集"}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {mode === "create"
              ? "冒険者手帳の任務から依頼書を掲示します"
              : "掲示中の依頼書内容を更新します"}
          </p>
        </header>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <FormField label="依頼者" required>
            <RequesterSelect
              members={activeStaff}
              value={form.requester}
              legacyRequester={mode === "edit" ? initial?.requester : null}
              onChange={(value) => update("requester", value)}
              disabled={submitting}
            />
          </FormField>
          {error && (
            <p className="border-2 border-red-400/55 bg-red-500/10 px-3 py-2 text-sm text-red-200 shadow-[3px_3px_0_#000]">
              {error}
            </p>
          )}

          <FormField label="依頼名" required>
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
            <FormField label="難易度">
              <select
                value={form.difficulty}
                onChange={(e) =>
                  update("difficulty", Number(e.target.value) as QuestDifficulty)
                }
                disabled={submitting}
                className="quest-input"
              >
                {DIFFICULTIES.map((difficulty) => (
                  <option key={difficulty} value={difficulty}>
                    Lv {QUEST_DIFFICULTY_LABELS[difficulty]}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="必要人員">
              <select
                value={form.requiredMembers}
                onChange={(e) => update("requiredMembers", Number(e.target.value))}
                disabled={submitting}
                className="quest-input"
              >
                {[1, 2, 3].map((count) => (
                  <option key={count} value={count}>
                    {count}人
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
          <div className="border-2 border-[var(--color-gold)]/45 bg-black/30 px-3 py-2 text-xs text-slate-400 shadow-[3px_3px_0_#000]">
            依頼ランク:{" "}
            <span className="text-[var(--color-gold-bright)] font-bold">
              {form.urgency * form.importance}
            </span>
            <span className="ml-2 text-slate-500">
              緊急度 × 重要度で自動計算されます
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="推定時間">
              <select
                value={form.estimatedMinutes ?? ""}
                onChange={(e) => update("estimatedMinutes", Number(e.target.value))}
                disabled={submitting}
                className="quest-input"
              >
                {ESTIMATED_MINUTE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="納期">
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={dateFromIso(form.dueAt)}
                  onChange={(e) =>
                    update(
                      "dueAt",
                      composeDueIso(e.target.value, timeFromIso(form.dueAt)),
                    )
                  }
                  disabled={submitting}
                  className="quest-input"
                />
                <input
                  type="time"
                  value={timeFromIso(form.dueAt)}
                  onChange={(e) =>
                    update(
                      "dueAt",
                      composeDueIso(dateFromIso(form.dueAt), e.target.value),
                    )
                  }
                  disabled={submitting}
                  className="quest-input"
                />
              </div>
            </FormField>
          </div>

          <FormField label="関連予定">
            <select
              value={form.linkedEventId ?? ""}
              onChange={(e) =>
                update(
                  "linkedEventId",
                  e.target.value ? Number(e.target.value) : null,
                )
              }
              disabled={submitting}
              className="quest-input"
            >
              <option value="">関連する予定を選択</option>
              {eventOptions.map((event) => (
                <option key={event.id} value={event.id}>
                  {formatCalendarDate(event.eventDate)} {formatEventTime(event)} [{EVENT_TYPE_LABELS[event.eventType]}] {event.title}
                </option>
              ))}
            </select>
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
                  ? "依頼書を掲示"
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
    <div className="block">
      <span className="quest-pixel-label text-[10px] tracking-wider text-[var(--color-gold)]">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </span>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function RequesterSelect({
  members,
  value,
  legacyRequester,
  onChange,
  disabled,
}: {
  members: PartyMember[];
  value: string;
  legacyRequester?: string | null;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selectedMember = members.find((member) => member.name === value) ?? null;
  const hasLegacy =
    legacyRequester != null &&
    legacyRequester.trim() !== "" &&
    !members.some((member) => member.name === legacyRequester);
  const selectedIsLegacy = value && !selectedMember;

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const selectValue = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
  };

  return (
    <div className="requester-select relative">
      <button
        type="button"
        disabled={disabled || (members.length === 0 && !hasLegacy)}
        onClick={() => setOpen((current) => !current)}
        className="requester-select-trigger quest-input flex min-h-11 w-full items-center justify-between gap-2 text-left disabled:opacity-50"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2">
          {selectedMember ? (
            <AvatarSprite
              avatarType={selectedMember.avatarType}
              fallback={selectedMember.avatar}
              alt={selectedMember.name}
              frame={selectedMember.avatarFrame}
              size="xs"
              className="shrink-0"
            />
          ) : (
            <span className="grid h-7 w-7 shrink-0 place-items-center border-2 border-white/20 bg-black/40 text-xs shadow-[2px_2px_0_#000]">
              ?
            </span>
          )}
          <span className="min-w-0">
            {selectedMember ? (
              <>
                <span className="block truncate text-sm text-slate-100">
                  {selectedMember.name}
                </span>
                <span className="block truncate text-[10px] text-[var(--color-gold)]">
                  Lv.{selectedMember.level} / {selectedMember.title}
                </span>
              </>
            ) : selectedIsLegacy ? (
              <>
                <span className="block truncate text-sm text-slate-100">
                  登録外: {value}
                </span>
                <span className="block truncate text-[10px] text-slate-500">
                  変更せず保存できます
                </span>
              </>
            ) : members.length === 0 ? (
              <span className="block truncate text-sm text-slate-500">
                冒険者パーティに登録されたメンバーがいません
              </span>
            ) : (
              <span className="block truncate text-sm text-slate-500">
                依頼者を選択
              </span>
            )}
          </span>
        </span>
        <span className="shrink-0 text-[var(--color-gold-bright)]">▼</span>
      </button>

      {open && (
        <div
          className="requester-select-menu absolute left-0 right-0 top-[calc(100%+0.35rem)] z-[80] max-h-[38dvh] overflow-y-auto custom-scroll border-2 border-[var(--color-gold-bright)] bg-[var(--color-abyss)] p-1 shadow-[4px_4px_0_#000]"
          role="listbox"
        >
          {hasLegacy && (
            <button
              type="button"
              onClick={() => selectValue(legacyRequester)}
              className={`requester-select-option w-full min-h-11 px-2 py-2 text-left ${
                value === legacyRequester ? "is-selected" : ""
              }`}
              role="option"
              aria-selected={value === legacyRequester}
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center border-2 border-white/20 bg-black/40 text-xs shadow-[2px_2px_0_#000]">
                ?
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm">
                  登録外: {legacyRequester}
                </span>
                <span className="block truncate text-[10px] text-slate-500">
                  既存の依頼者
                </span>
              </span>
            </button>
          )}

          {members.map((member) => (
            <button
              key={member.id}
              type="button"
              onClick={() => selectValue(member.name)}
              className={`requester-select-option w-full min-h-11 px-2 py-2 text-left ${
                value === member.name ? "is-selected" : ""
              }`}
              role="option"
              aria-selected={value === member.name}
            >
              <AvatarSprite
                avatarType={member.avatarType}
                fallback={member.avatar}
                alt={member.name}
                frame={member.avatarFrame}
                size="xs"
                className="shrink-0"
              />
              <span className="min-w-0">
                <span className="block truncate text-sm text-slate-100">
                  {member.name}{" "}
                  <span className="text-[var(--color-gold)]">Lv.{member.level}</span>
                </span>
                <span className="block truncate text-[10px] text-slate-500">
                  {member.title} / {member.role}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
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
            className={`min-h-11 border-2 text-sm transition-all disabled:opacity-45 shadow-[2px_2px_0_#000] ${
              score <= value
                ? "border-[var(--color-gold-bright)] bg-[var(--color-gold)]/22 text-[var(--color-gold-bright)]"
                : "border-white/20 bg-black/25 text-slate-600 hover:border-[var(--color-gold)]/70"
            }`}
          >
            ◆
          </button>
        ))}
      </div>
    </div>
  );
}

function priorityFromScores(urgency: number, importance: number): Priority {
  const score = urgency * importance;
  if (score >= 20) return "S";
  if (score >= 12) return "A";
  if (score >= 6) return "B";
  return "C";
}

function dateFromIso(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function timeFromIso(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
}

function composeDueIso(dateValue: string, timeValue: string) {
  if (!dateValue) return null;
  const date = new Date(`${dateValue}T${timeValue || "23:59"}`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}
