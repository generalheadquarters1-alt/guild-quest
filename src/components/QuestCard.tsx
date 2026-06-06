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
import { QuestStatusBadge } from "./QuestStatusBadge";
import { AvatarSprite } from "./AvatarSprite";

const STATUS_RING: Record<Quest["status"], string> = {
  open: "quest-card-open",
  in_progress: "quest-card-in-progress",
  succession_needed: "quest-card-succession",
  completed: "quest-card-completed",
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
  className = "",
}: {
  label: string;
  names: string[];
  staffByName: ReadonlyMap<string, PartyMember>;
  highlight?: boolean;
  className?: string;
}) {
  const members = names.filter((name) => !isEmptySlot(name));
  return (
    <div className={`quest-member-field min-w-0 border border-white/6 bg-black/18 px-2.5 py-2 shadow-[2px_2px_0_rgba(0,0,0,0.22)] ${className}`}>
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
  const primaryAction = showComplete
    ? {
        label: "討伐完了",
        variant: "xp" as const,
        onClick: () => onRequestComplete(quest.id),
      }
    : showSuccessor
      ? {
          label: "継承する",
          variant: "mana" as const,
          onClick: () => onBecomeSuccessor(quest.id),
        }
      : showRequestSuccession
        ? {
            label: "継承を依頼",
            variant: "rare" as const,
            onClick: () => onRequestSuccession(quest.id),
          }
        : showAccept
          ? {
              label: "挑戦する",
              variant: "gold" as const,
              onClick: () => onAccept(quest.id),
            }
          : null;
  const priorityScore = getPriorityScore(quest);
  const dangerClass =
    priorityScore >= 20
      ? "quest-card-danger-high"
      : priorityScore >= 12
        ? "quest-card-danger-mid"
        : "";
  const status = getStatusPresentation(quest);
  const questIcon = getQuestIcon(quest);
  const successorLabel =
    needsSuccessor
      ? "助っ人募集中"
      : successorSlotsFilled > 0
        ? `助っ人 ${successorSlotsFilled}名`
        : "助っ人なし";

  return (
    <article
      className={`quest-card quest-card-compact quest-card-dense tap-card p-3 transition-all duration-300 animate-fade-up ${STATUS_RING[quest.status]} ${dangerClass} ${
        quest.urgency >= 4 ? "quest-card-emergency" : ""
      } ${featured ? "quest-card-featured" : ""}`}
      style={{
        animationDelay: `${index * 80}ms`,
        animationFillMode: "both",
      }}
    >
      <div className="quest-card-row">
        <div className="quest-card-left">
          <div className={`notice-ribbon ${status.ribbonClass}`}>
            {status.label}
          </div>
          <div className="quest-notice-icon compact-icon" aria-hidden>
            <span>{questIcon}</span>
          </div>
        </div>

        <div className="quest-card-main min-w-0">
          <div className="quest-card-title-row">
            <h3 className="pixel-title quest-card-title text-slate-50">
              {quest.title}
            </h3>
            <QuestStatusBadge status={quest.status} />
          </div>

          <p className="quest-card-meta">
            推定 {quest.estimatedTime}
            <span aria-hidden> / </span>
            <span>{successorLabel}</span>
            {(isNew || isMine || almostFullParty) && (
              <>
                <span aria-hidden> / </span>
                <span>
                  {isNew ? "新着" : isMine ? "自分の依頼" : "あと1枠"}
                </span>
              </>
            )}
          </p>

          <div className="quest-gauge-inline">
            <InlineGauge label="緊急" value={quest.urgency} />
            <InlineGauge label="重要" value={quest.importance} />
          </div>

          <div className="quest-party-row">
            <MemberField
              label="挑戦者"
              names={[quest.challenger]}
              staffByName={staffByName}
              highlight
              className="quest-member-challenger"
            />
            <MemberField
              label="継承者"
              names={[quest.successor1, quest.successor2]}
              staffByName={staffByName}
              className="quest-member-successors"
            />
          </div>
        </div>

        <aside className="quest-card-side">
          <div className="quest-rank-panel">
            <p className="quest-pixel-label text-[10px]">依頼ランク</p>
            <strong>{priorityScore}</strong>
            <span>
              ({quest.urgency}×{quest.importance})
            </span>
          </div>
          <div className="quest-actions">
            {primaryAction && (
              <ActionButton
                variant={primaryAction.variant}
                onClick={primaryAction.onClick}
                disabled={disabled}
              >
                {primaryAction.label}
              </ActionButton>
            )}
            {!hasPrimaryAction && (
              <span className="quest-action-spacer" aria-hidden />
            )}
            <ActionButton
              variant="plain"
              onClick={() => onOpenDetail(quest.id)}
            >
              詳細
            </ActionButton>
          </div>
        </aside>
      </div>
    </article>
  );
}

function InlineGauge({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="quest-pixel-label text-[10px] tracking-wider text-[var(--color-gold-dim)]/90">
        {label}
      </span>
      <span className="flex gap-0.5" aria-label={`${label} ${value}`}>
        {[1, 2, 3, 4, 5].map((score) => (
          <span
            key={score}
            className={score <= value ? (value >= 4 ? "text-red-800" : "text-amber-800") : "text-stone-400"}
          >
            ◆
          </span>
        ))}
      </span>
    </span>
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
    };
  }
  if (quest.urgency >= 4) {
    return {
      label: "緊急!!",
      ribbonClass: "notice-ribbon-danger",
    };
  }
  if (quest.status === "succession_needed") {
    return {
      label: "助っ人募集",
      ribbonClass: "notice-ribbon-rare",
    };
  }
  if (quest.status === "open") {
    return {
      label: "未受注",
      ribbonClass: "notice-ribbon-open",
    };
  }
  return {
    label: "挑戦中",
    ribbonClass: "notice-ribbon-progress",
  };
}

function ActionButton({
  children,
  onClick,
  variant,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  variant: "gold" | "mana" | "xp" | "rare" | "plain";
  disabled?: boolean;
}) {
  const styles = {
    gold: "border-[var(--color-gold)]/50 text-[var(--color-gold-bright)] hover:bg-[var(--color-gold)]/15",
    mana: "border-[var(--color-mana)]/50 text-[var(--color-mana)] hover:bg-[var(--color-mana)]/10",
    xp: "border-[var(--color-xp)]/50 text-[var(--color-xp)] hover:bg-[var(--color-xp)]/10",
    rare: "border-[var(--color-rare)]/50 text-[var(--color-rare)] hover:bg-[var(--color-rare)]/10",
    plain: "border-stone-700/45 text-stone-800 hover:bg-stone-900/10",
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
