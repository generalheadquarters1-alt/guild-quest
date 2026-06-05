import type { ReactNode } from "react";
import type { Quest } from "../data/quests";
import {
  canAcceptQuest,
  canBecomeSuccessor,
  canMarkComplete,
  canRequestSuccession,
  getPriorityScore,
  isEmptySlot,
  isPlayerOnQuest,
} from "../lib/questUtils";
import { LevelBadge } from "./LevelBadge";
import { PriorityBadge } from "./PriorityBadge";
import { QuestSecondaryActions } from "./QuestSecondaryActions";
import { QuestStatusBadge } from "./QuestStatusBadge";

const STATUS_RING: Record<Quest["status"], string> = {
  open: "quest-card-open",
  in_progress: "quest-card-in-progress",
  succession_needed: "quest-card-succession",
  completed: "quest-card-completed",
};

const STATUS_COPY: Record<Quest["status"], string> = {
  open: "まだ誰も挑戦していません",
  in_progress: "担当者が対応中です",
  succession_needed: "助っ人を募集しています",
  completed: "討伐完了しました",
};

interface QuestCardProps {
  quest: Quest;
  index: number;
  selectedPlayer: string;
  onAccept: (questId: number) => void;
  onBecomeSuccessor: (questId: number) => void;
  onRequestSuccession: (questId: number) => void;
  onRequestComplete: (questId: number) => void;
  onEdit: (questId: number) => void;
  onRequestDelete: (questId: number) => void;
  disabled?: boolean;
  featured?: boolean;
}

function Field({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  const empty = value === "—";
  return (
    <div className="min-w-0 rounded-md border border-white/6 bg-black/18 px-2.5 py-2">
      <span className="text-[10px] tracking-wider text-[var(--color-gold-dim)]/90">
        {label}
      </span>
      <span
        className={`text-xs sm:text-sm truncate ${
          empty
            ? "text-slate-500 italic"
            : highlight
              ? "text-[var(--color-gold-bright)] font-medium"
              : "text-slate-200"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

export function QuestCard({
  quest,
  index,
  selectedPlayer,
  onAccept,
  onBecomeSuccessor,
  onRequestSuccession,
  onRequestComplete,
  onEdit,
  onRequestDelete,
  disabled = false,
  featured = false,
}: QuestCardProps) {
  const showAccept = canAcceptQuest(quest);
  const showSuccessor = canBecomeSuccessor(quest, selectedPlayer);
  const showRequestSuccession = canRequestSuccession(quest, selectedPlayer);
  const showComplete = canMarkComplete(quest, selectedPlayer);
  const isOpen = quest.status === "open";
  const needsSuccessor = quest.status === "succession_needed";
  const isMine = isPlayerOnQuest(quest, selectedPlayer);
  const isNew =
    quest.createdAt != null &&
    Date.now() - new Date(quest.createdAt).getTime() < 1000 * 60 * 60 * 24;
  const successorSlotsFilled = [quest.successor1, quest.successor2].filter(
    (slot) => !isEmptySlot(slot),
  ).length;
  const almostFullParty =
    !isEmptySlot(quest.challenger) &&
    successorSlotsFilled === 1 &&
    quest.status !== "completed";

  const hasPrimaryAction =
    showAccept || showSuccessor || showRequestSuccession || showComplete;
  const priorityScore = getPriorityScore(quest);
  const dangerClass =
    priorityScore >= 20
      ? "quest-card-danger-high"
      : priorityScore >= 12
        ? "quest-card-danger-mid"
        : "";

  return (
    <article
      className={`rpg-frame quest-card tap-card rounded-lg p-4 sm:p-5 transition-all duration-300 hover:border-[var(--color-gold)]/60 hover:shadow-[0_8px_32px_rgba(0,0,0,0.5),0_0_24px_rgba(212,168,83,0.12)] animate-fade-up ${STATUS_RING[quest.status]} ${dangerClass} ${
        quest.urgency >= 4 ? "quest-card-emergency" : ""
      } ${featured ? "quest-card-featured" : ""}`}
      style={{
        animationDelay: `${index * 80}ms`,
        animationFillMode: "both",
      }}
    >
      {(isOpen || needsSuccessor || isNew || isMine || almostFullParty) && (
        <div className="flex flex-wrap items-center gap-1.5 mb-3 -mt-1">
          {isNew && <CompactBadge tone="mana">新着</CompactBadge>}
          {quest.urgency >= 4 && <CompactBadge tone="danger">緊急</CompactBadge>}
          {isOpen && (
            <CompactBadge tone="gold">未受注</CompactBadge>
          )}
          {needsSuccessor && <CompactBadge tone="rare">継承募集</CompactBadge>}
          {isMine && <CompactBadge tone="xp">自分</CompactBadge>}
          {almostFullParty && <CompactBadge tone="mana">あと1枠</CompactBadge>}
        </div>
      )}

      <header className="mb-3 pb-3 border-b border-[var(--color-gold)]/15">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1 basis-[14rem]">
            <p className="text-[10px] sm:text-xs text-[var(--color-mana)]/90 mb-1 tracking-wider">
              依頼者: <span className="text-slate-400">{quest.requester}</span>
            </p>
            <h3 className="text-lg sm:text-xl font-semibold text-slate-50 leading-snug break-words">
              <span className="gold-text">QUEST</span>{" "}
              <span>{quest.title}</span>
            </h3>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <PriorityBadge priority={quest.priority} />
            <LevelBadge level={quest.level} />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <QuestStatusBadge status={quest.status} />
          <span className="rounded border border-red-400/35 bg-red-500/10 px-2 py-1 text-[10px] font-bold text-red-200">
            危険度 {priorityScore}
          </span>
          <span className="text-[11px] text-slate-400">
            {STATUS_COPY[quest.status]}
          </span>
        </div>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-3">
        <Field label="推定時間" value={quest.estimatedTime} />
        <Field label="挑戦者" value={quest.challenger} highlight />
        <GaugeField label="緊急度" value={quest.urgency} />
        <GaugeField label="重要度" value={quest.importance} />
      </div>

      <div className="grid grid-cols-2 gap-2.5 mb-3">
        <Field label="継承者1" value={quest.successor1} />
        <Field label="継承者2" value={quest.successor2} />
      </div>

      {quest.description && (
        <p className="text-xs text-slate-400 leading-relaxed mb-4 line-clamp-2 sm:line-clamp-3">
          {quest.description}
        </p>
      )}

      {hasPrimaryAction && (
        <div className="grid grid-cols-1 sm:flex sm:flex-wrap gap-2 pt-3 border-t border-[var(--color-gold)]/10">
          {showAccept && (
            <ActionButton
              variant="gold"
              onClick={() => onAccept(quest.id)}
              disabled={disabled}
            >
              挑戦する
            </ActionButton>
          )}
          {showRequestSuccession && (
            <ActionButton
              variant="rare"
              onClick={() => onRequestSuccession(quest.id)}
              disabled={disabled}
            >
              継承を依頼
            </ActionButton>
          )}
          {showSuccessor && (
            <ActionButton
              variant="mana"
              onClick={() => onBecomeSuccessor(quest.id)}
              disabled={disabled}
            >
              継承する
            </ActionButton>
          )}
          {showComplete && (
            <ActionButton
              variant="xp"
              onClick={() => onRequestComplete(quest.id)}
              disabled={disabled}
            >
              討伐完了
            </ActionButton>
          )}
        </div>
      )}

      <QuestSecondaryActions
        className={hasPrimaryAction ? "mt-3" : "mt-1 pt-2 border-t border-white/5"}
        onEdit={() => onEdit(quest.id)}
        onDelete={() => onRequestDelete(quest.id)}
        disabled={disabled}
      />
    </article>
  );
}

function GaugeField({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 rounded-md border border-white/6 bg-black/18 px-2.5 py-2">
      <span className="text-[10px] tracking-wider text-[var(--color-gold-dim)]/90">
        {label}
      </span>
      <span className="mt-1 flex gap-0.5" aria-label={`${label} ${value}`}>
        {[1, 2, 3, 4, 5].map((score) => (
          <span
            key={score}
            className={score <= value ? "text-[var(--color-gold-bright)]" : "text-slate-700"}
          >
            ◆
          </span>
        ))}
      </span>
    </div>
  );
}

function CompactBadge({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "gold" | "mana" | "xp" | "rare" | "danger";
}) {
  const styles = {
    gold: "border-[var(--color-gold)]/45 text-[var(--color-gold-bright)] bg-[var(--color-gold)]/12",
    mana: "border-[var(--color-mana)]/40 text-[var(--color-mana)] bg-[var(--color-mana)]/10",
    xp: "border-[var(--color-xp)]/40 text-[var(--color-xp)] bg-[var(--color-xp)]/10",
    rare: "border-[var(--color-rare)]/45 text-[var(--color-rare)] bg-[var(--color-rare)]/12",
    danger: "border-red-400/55 text-red-200 bg-red-500/18 shadow-[0_0_14px_rgba(239,68,68,0.2)]",
  };

  return (
    <span
      className={`inline-flex min-h-6 items-center rounded-full border px-2 text-[10px] font-bold uppercase tracking-wider ${styles[tone]}`}
    >
      {children}
    </span>
  );
}

function ActionButton({
  children,
  onClick,
  variant,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  variant: "gold" | "mana" | "xp" | "rare";
  disabled?: boolean;
}) {
  const styles = {
    gold: "border-[var(--color-gold)]/50 text-[var(--color-gold-bright)] hover:bg-[var(--color-gold)]/15",
    mana: "border-[var(--color-mana)]/50 text-[var(--color-mana)] hover:bg-[var(--color-mana)]/10",
    xp: "border-[var(--color-xp)]/50 text-[var(--color-xp)] hover:bg-[var(--color-xp)]/10",
    rare: "border-[var(--color-rare)]/50 text-[var(--color-rare)] hover:bg-[var(--color-rare)]/10",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-h-11 w-full sm:w-auto px-4 py-2 text-sm font-semibold rounded border transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0.5 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 ${styles[variant]}`}
    >
      {children}
    </button>
  );
}
