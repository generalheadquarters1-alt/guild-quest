import type { ReactNode } from "react";
import type { PartyMember, Quest } from "../data/quests";
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
import { QuestStatusBadge } from "./QuestStatusBadge";
import { AvatarSprite } from "./AvatarSprite";

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
  staffByName: ReadonlyMap<string, PartyMember>;
  onAccept: (questId: number) => void;
  onBecomeSuccessor: (questId: number) => void;
  onRequestSuccession: (questId: number) => void;
  onRequestComplete: (questId: number) => void;
  onEdit: (questId: number) => void;
  onRequestDelete: (questId: number) => void;
  onOpenDetail: (questId: number) => void;
  disabled?: boolean;
  featured?: boolean;
}

function MemberField({
  label,
  names,
  staffByName,
  highlight,
}: {
  label: string;
  names: string[];
  staffByName: ReadonlyMap<string, PartyMember>;
  highlight?: boolean;
}) {
  const members = names.filter((name) => !isEmptySlot(name));
  return (
    <div className="min-w-0 border border-white/6 bg-black/18 px-2.5 py-2 shadow-[2px_2px_0_rgba(0,0,0,0.22)]">
      <span className="quest-pixel-label block text-[10px] tracking-wider text-[var(--color-gold-dim)]/90">
        {label}
      </span>
      {members.length === 0 ? (
        <span className="block text-xs sm:text-sm truncate text-slate-500 italic">
          —
        </span>
      ) : (
        <span className="mt-1 flex min-w-0 flex-wrap gap-1">
          {members.map((name) => {
            const member = staffByName.get(name);
            return (
              <span
                key={name}
                className={`quest-member-chip ${
                  highlight ? "is-highlighted" : ""
                }`}
              >
                <AvatarSprite
                  avatarType={member?.avatarType}
                  fallback={member?.avatar ?? "⚔️"}
                  alt={name}
                  size="xs"
                  useFallbackWhenMissing={!member}
                />
                <span className="truncate">{name}</span>
              </span>
            );
          })}
        </span>
      )}
    </div>
  );
}

export function QuestCard({
  quest,
  index,
  selectedPlayer,
  staffByName,
  onAccept,
  onBecomeSuccessor,
  onRequestSuccession,
  onRequestComplete,
  onOpenDetail,
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
  const status = getStatusPresentation(quest);
  const questIcon = getQuestIcon(quest);

  return (
    <article
      className={`quest-card quest-card-compact tap-card p-3 transition-all duration-300 animate-fade-up ${STATUS_RING[quest.status]} ${dangerClass} ${
        quest.urgency >= 4 ? "quest-card-emergency" : ""
      } ${featured ? "quest-card-featured" : ""}`}
      style={{
        animationDelay: `${index * 80}ms`,
        animationFillMode: "both",
      }}
    >
      {(isOpen || needsSuccessor || isNew || isMine || almostFullParty) && (
        <div className="compact-badges flex flex-wrap items-center gap-1.5 mb-2 -mt-1 pl-1">
          {isNew && <CompactBadge tone="mana">新着</CompactBadge>}
          {quest.urgency >= 4 && <CompactBadge tone="danger">緊急</CompactBadge>}
          {isOpen && (
            <CompactBadge tone="gold">未受注</CompactBadge>
          )}
          {needsSuccessor && <CompactBadge tone="rare">助っ人募集</CompactBadge>}
          {isMine && <CompactBadge tone="xp">自分</CompactBadge>}
          {almostFullParty && <CompactBadge tone="mana">あと1枠</CompactBadge>}
        </div>
      )}

      <div className={`notice-ribbon ${status.ribbonClass}`}>
        {status.label}
      </div>

      <div className="quest-notice-layout">
        <div className="quest-notice-icon compact-icon" aria-hidden>
          <span>{questIcon}</span>
        </div>

        <div className="quest-notice-main min-w-0">
          <header className="border-b-2 border-[rgba(74,46,25,0.28)] pb-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="pixel-title text-lg sm:text-xl font-semibold text-slate-50 leading-snug break-words line-clamp-2">
                  {quest.title}
                </h3>
                <p className="quest-pixel-label mt-1 text-[10px] sm:text-xs text-[var(--color-mana)]/90 tracking-wider">
                  推定時間:{" "}
                  <span className="text-slate-400">{quest.estimatedTime}</span>
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <PriorityBadge priority={quest.priority} />
                <LevelBadge level={quest.level} />
              </div>
            </div>
          </header>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <GaugeField label="緊急度" value={quest.urgency} />
            <GaugeField label="重要度" value={quest.importance} />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <QuestStatusBadge status={quest.status} />
            <span className="text-[11px] text-slate-400">
              {STATUS_COPY[quest.status]}
            </span>
          </div>

        </div>

        <aside className="quest-rank-panel">
          <p className="quest-pixel-label text-[10px]">依頼ランク</p>
          <strong>{priorityScore}</strong>
          <span>
            ({quest.urgency}×{quest.importance})
          </span>
          <span className={`quest-seal ${status.sealClass}`} aria-hidden>
            ✦
          </span>
        </aside>
      </div>

      <div className="quest-party-row grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_auto] gap-2 mt-2">
        <MemberField
          label="挑戦者"
          names={[quest.challenger]}
          staffByName={staffByName}
          highlight
        />
        <MemberField
          label="継承者"
          names={[quest.successor1, quest.successor2]}
          staffByName={staffByName}
        />
        <button
          type="button"
          onClick={() => onOpenDetail(quest.id)}
          className="quest-detail-button min-h-11 border border-white/6 bg-black/18 px-2.5 py-2 text-left text-xs font-bold shadow-[2px_2px_0_rgba(0,0,0,0.22)]"
        >
          ▶ 詳細
        </button>
      </div>

      {hasPrimaryAction && (
        <div className="grid grid-cols-1 sm:flex sm:flex-wrap gap-2 mt-4 pt-3 border-t-2 border-[rgba(74,46,25,0.22)]">
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

      {!hasPrimaryAction && (
        <button
          type="button"
          onClick={() => onOpenDetail(quest.id)}
          className="quest-detail-button mt-3 min-h-11 w-full border-2 border-stone-700/45 bg-stone-900/10 px-3 text-sm font-bold shadow-[2px_2px_0_#000]"
        >
          ▶ 詳細
        </button>
      )}
    </article>
  );
}

function GaugeField({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 border border-white/6 bg-black/18 px-2.5 py-2 shadow-[2px_2px_0_rgba(0,0,0,0.22)]">
      <span className="quest-pixel-label block text-[10px] tracking-wider text-[var(--color-gold-dim)]/90">
        {label}
      </span>
      <span className="mt-1 flex gap-0.5" aria-label={`${label} ${value}`}>
        {[1, 2, 3, 4, 5].map((score) => (
          <span
            key={score}
            className={score <= value ? (value >= 4 ? "text-red-800" : "text-amber-800") : "text-stone-400"}
          >
            ◆
          </span>
        ))}
      </span>
    </div>
  );
}

function getQuestIcon(quest: Quest) {
  if (quest.status === "completed") return "✓";
  if (quest.status === "succession_needed") return "🛡️";
  if (quest.urgency >= 4) return "⚔️";
  if (quest.status === "open") return "🎁";
  return "📜";
}

function getStatusPresentation(quest: Quest) {
  if (quest.status === "completed") {
    return {
      label: "達成済み",
      ribbonClass: "notice-ribbon-completed",
      sealClass: "quest-seal-completed",
    };
  }
  if (quest.urgency >= 4) {
    return {
      label: "緊急!!",
      ribbonClass: "notice-ribbon-danger",
      sealClass: "quest-seal-danger",
    };
  }
  if (quest.status === "succession_needed") {
    return {
      label: "助っ人募集",
      ribbonClass: "notice-ribbon-rare",
      sealClass: "quest-seal-rare",
    };
  }
  if (quest.status === "open") {
    return {
      label: "未受注",
      ribbonClass: "notice-ribbon-open",
      sealClass: "quest-seal-open",
    };
  }
  return {
    label: "挑戦中",
    ribbonClass: "notice-ribbon-progress",
    sealClass: "quest-seal-progress",
  };
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
    <span className={`pixel-chip inline-flex min-h-6 items-center px-2 text-[10px] font-bold uppercase tracking-wider ${styles[tone]}`}>
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
      className={`quest-btn-ghost min-h-11 w-full sm:w-auto px-4 py-2 text-sm font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-45 ${styles[variant]}`}
    >
      <span className="mr-1.5" aria-hidden>
        ▶
      </span>
      {children}
    </button>
  );
}
