import type { ReactNode } from "react";
import {
  formatCalendarDate,
  formatEventTime,
  isPastDeadline,
  type CalendarEvent,
} from "../data/calendar";
import {
  QUEST_DIFFICULTY_LABELS,
  type PartyMember,
  type Quest,
} from "../data/quests";
import {
  canAcceptQuest,
  canMarkComplete,
  canRequestSuccession,
  getPriorityScore,
  isPlayerOnQuest,
  isQuestFull,
} from "../lib/questUtils";
import { AvatarSprite } from "./AvatarSprite";
import { QuestStatusBadge } from "./QuestStatusBadge";

const STATUS_RING: Record<Quest["status"], string> = {
  open: "quest-card-open",
  recruiting: "quest-card-recruiting",
  help_wanted: "quest-card-succession",
  in_progress: "quest-card-in-progress",
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
  relatedEvent?: CalendarEvent | null;
  disabled?: boolean;
  featured?: boolean;
}

export function QuestCard({
  quest,
  index,
  selectedPlayer,
  staffByName,
  onAccept,
  onRequestSuccession,
  onRequestComplete,
  onOpenDetail,
  relatedEvent,
  disabled = false,
  featured = false,
}: QuestCardProps) {
  const isMine = isPlayerOnQuest(quest, selectedPlayer);
  const full = isQuestFull(quest);
  const canJoin = canAcceptQuest(quest) && !isMine && !full;
  const canComplete = canMarkComplete(quest, selectedPlayer);
  const canAskHelp = canRequestSuccession(quest, selectedPlayer);
  const primaryAction = canComplete
    ? {
        label: "討伐完了",
        variant: "xp" as const,
        onClick: () => onRequestComplete(quest.id),
      }
    : canJoin
      ? {
          label: "参加する",
          variant: "gold" as const,
          onClick: () => onAccept(quest.id),
        }
      : null;
  const deadlinePast =
    isPastQuestDue(quest) ||
    (relatedEvent?.eventType === "deadline" ? isPastDeadline(relatedEvent) : false);
  const dueLabel = quest.dueAt
    ? formatQuestDueAt(quest.dueAt)
    : relatedEvent
      ? formatCalendarDate(relatedEvent.eventDate)
      : "未設定";
  const dangerClass =
    deadlinePast || getPriorityScore(quest) >= 20
      ? "quest-card-danger-high"
      : getPriorityScore(quest) >= 12
        ? "quest-card-danger-mid"
        : "";

  return (
    <article
      className={`quest-card quest-card-compact quest-card-dense tap-card p-3 transition-all duration-300 animate-fade-up ${
        STATUS_RING[quest.status]
      } ${dangerClass} ${deadlinePast ? "quest-card-overdue" : ""} ${
        featured ? "quest-card-featured" : ""
      }`}
      style={{
        animationDelay: `${index * 60}ms`,
        animationFillMode: "both",
      }}
    >
      <div className="quest-card-row">
        <div className="quest-card-left">
          <div className={`notice-ribbon ${getRibbonClass(quest, deadlinePast)}`}>
            {deadlinePast ? "期限超過" : getStatusLabel(quest)}
          </div>
          <div className="quest-notice-icon compact-icon" aria-hidden>
            <span>{getQuestIcon(quest, deadlinePast)}</span>
          </div>
        </div>

        <div className="quest-card-main min-w-0">
          <div className="quest-card-title-row">
            <h3 className="pixel-title quest-card-title text-slate-50">
              {quest.title}
            </h3>
            <QuestStatusBadge status={quest.status} overdue={deadlinePast} />
          </div>

          <div className="quest-card-facts">
            <Fact label="Lv" value={QUEST_DIFFICULTY_LABELS[quest.difficulty]} />
            <Fact label="推定" value={quest.estimatedTime} />
            <Fact label="納期" value={dueLabel} danger={deadlinePast} />
            <Fact
              label="参加"
              value={`${quest.participants.length}/${quest.requiredMembers}`}
              danger={full && quest.status !== "completed"}
            />
          </div>

          <div className="quest-party-line">
            <span className="quest-pixel-label text-[10px]">参加メンバー</span>
            {quest.participants.length === 0 ? (
              <span className="text-xs text-stone-500">まだ誰も参加していません</span>
            ) : (
              <div className="flex min-w-0 flex-wrap gap-1">
                {quest.participants.map((name) => {
                  const member = staffByName.get(name);
                  return (
                    <span
                      key={name}
                      className={`quest-member-chip ${name === selectedPlayer ? "is-highlighted" : ""}`}
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
              </div>
            )}
          </div>

          {relatedEvent && (
            <div className="mt-1 flex flex-wrap gap-1">
              <span className="calendar-tag text-[10px]">📅 関連予定あり</span>
              {relatedEvent.eventType === "deadline" && (
                <span className={`calendar-tag text-[10px] ${deadlinePast ? "is-danger" : ""}`}>
                  {deadlinePast
                    ? "期限超過"
                    : `期限 ${formatCalendarDate(relatedEvent.eventDate)} ${formatEventTime(relatedEvent)}`}
                </span>
              )}
            </div>
          )}
        </div>

        <aside className="quest-card-side">
          <div className="quest-rank-panel">
            <p className="quest-pixel-label text-[10px]">依頼ランク</p>
            <strong>{getPriorityScore(quest)}</strong>
            <span>
              {quest.urgency}×{quest.importance}
            </span>
          </div>
          <div className="quest-actions">
            {primaryAction ? (
              <ActionButton
                variant={primaryAction.variant}
                onClick={primaryAction.onClick}
                disabled={disabled}
              >
                {primaryAction.label}
              </ActionButton>
            ) : (
              <ActionButton variant="plain" onClick={() => undefined} disabled>
                {full && quest.status !== "completed"
                  ? "定員に達しています"
                  : isMine
                    ? "参加中"
                    : "受付停止"}
              </ActionButton>
            )}
            {canAskHelp && (
              <ActionButton
                variant="rare"
                onClick={() => onRequestSuccession(quest.id)}
                disabled={disabled}
              >
                助っ人募集
              </ActionButton>
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

function Fact({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <span className={`quest-fact ${danger ? "is-danger" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </span>
  );
}

function getStatusLabel(quest: Quest) {
  if (quest.status === "open") return "未受注";
  if (quest.status === "recruiting") return "募集中";
  if (quest.status === "help_wanted") return "助っ人募集";
  if (quest.status === "in_progress") return "挑戦中";
  return "完了";
}

function getRibbonClass(quest: Quest, overdue: boolean) {
  if (overdue) return "notice-ribbon-danger";
  if (quest.status === "completed") return "notice-ribbon-completed";
  if (quest.status === "help_wanted") return "notice-ribbon-rare";
  if (quest.status === "open") return "notice-ribbon-open";
  if (quest.status === "recruiting") return "notice-ribbon-recruiting";
  return "notice-ribbon-progress";
}

function getQuestIcon(quest: Quest, overdue: boolean) {
  if (overdue) return "!";
  if (quest.status === "completed") return "✓";
  if (quest.status === "help_wanted") return "🛡️";
  if (quest.status === "recruiting") return "👥";
  if (quest.status === "open") return "📜";
  return "⚔️";
}

function isPastQuestDue(quest: Quest) {
  if (!quest.dueAt || quest.status === "completed") return false;
  return new Date(quest.dueAt).getTime() < Date.now();
}

function formatQuestDueAt(value: string) {
  try {
    return new Intl.DateTimeFormat("ja-JP", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function ActionButton({
  children,
  onClick,
  variant,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  variant: "gold" | "xp" | "rare" | "plain";
  disabled?: boolean;
}) {
  const styles = {
    gold: "border-[var(--color-gold)]/50 text-[var(--color-gold-bright)] hover:bg-[var(--color-gold)]/15",
    xp: "border-[var(--color-xp)]/50 text-[var(--color-xp)] hover:bg-[var(--color-xp)]/10",
    rare: "border-[var(--color-rare)]/50 text-[var(--color-rare)] hover:bg-[var(--color-rare)]/10",
    plain: "border-stone-700/45 text-stone-800 hover:bg-stone-900/10",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`quest-btn-ghost min-h-11 w-full sm:w-auto px-3 py-2 text-xs font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-45 ${styles[variant]}`}
    >
      <span className="mr-1" aria-hidden>
        ▶
      </span>
      {children}
    </button>
  );
}
