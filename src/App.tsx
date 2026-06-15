import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import { ActivityLog } from "./components/ActivityLog";
import { CompletedQuestLog } from "./components/CompletedQuestLog";
import { ConfirmModal } from "./components/ConfirmModal";
import { AvatarSprite } from "./components/AvatarSprite";
import {
  QuestFormModal,
  type QuestFormData,
} from "./components/QuestFormModal";
import { PartyPanel } from "./components/PartyPanel";
import { QuestCard } from "./components/QuestCard";
import { ReopenQuestModal } from "./components/ReopenQuestModal";
import { Sidebar } from "./components/Sidebar";
import {
  EXPEDITION_DESTINATIONS,
  GROWTH_ACTION_LABELS,
  calculateExpeditionSuccessRate,
  formatRemainingTime,
  formatRewardMaterialTable,
  formatRewardItems,
  getCurrentExpedition,
  getEquipment,
  getExpeditionTicketsForRank as getTicketsForRank,
  getJobClass,
  isExpeditionReady,
  type Expedition,
  type ExpeditionDestination,
  type GrowthAction,
  type PlayerResources,
} from "./data/expeditions";
import {
  EMPTY_EVENT_FORM,
  EVENT_TYPE_LABELS,
  EVENT_TYPE_TONES,
  IMPORTANCE_LABELS,
  daysUntil,
  eventToForm,
  formatCalendarDate,
  formatCalendarMonth,
  formatEventTime,
  getMonthGrid,
  getWeekRange,
  isDateWithinRange,
  isPastDeadline,
  parseDateInput,
  toDateInputValue,
  type CalendarEvent,
  type CalendarEventFormData,
  type CalendarEventType,
} from "./data/calendar";
import {
  EMPTY_TASK_FORM,
  TASK_STATUS_LABELS,
  TASK_TAB_LABELS,
  filterTasksByTab,
  getTaskBaseExp,
  getTaskDueLabel,
  getTaskDueTone,
  getTaskScore,
  sortTasks as sortAdventurerTasks,
  taskToForm,
  type AdventurerTask,
  type AdventurerTaskFormData,
  type AdventurerTaskTab,
  type DirectQuestPostFormData,
  type QuestPublishFormData,
} from "./data/adventurerTasks";
import {
  NOTICE_TYPE_LABELS,
  REQUEST_STATUS_LABELS,
  REQUEST_TYPE_LABELS,
  canIssueDirective,
  getDeadlineWarningLevel,
  getRequestTone,
  type GuildNotice,
  type GuildRequest,
  type GuildRequestFormData,
  type GuildRequestType,
} from "./data/guildOperations";
import { AVATAR_OPTIONS, DEFAULT_AVATAR_TYPE } from "./data/avatars";
import {
  ESTIMATED_MINUTE_OPTIONS,
  GUILD_STATS,
  QUEST_DIFFICULTY_LABELS,
  type QuestDifficulty,
} from "./data/quests";
import type { CompletedQuestEntry, PartyMember, Quest } from "./data/quests";
import { useExpeditions } from "./hooks/useExpeditions";
import { useCalendarEvents } from "./hooks/useCalendarEvents";
import { useAdventurerTasks } from "./hooks/useAdventurerTasks";
import { useGuildOperations } from "./hooks/useGuildOperations";
import type { QuestLog } from "./lib/questLogApi";
import { insertQuestLog } from "./lib/questLogApi";
import { useQuestLogs } from "./hooks/useQuestLogs";
import { useQuests } from "./hooks/useQuests";
import { useStaff } from "./hooks/useStaff";
import {
  claimExpeditionReward,
  ExpeditionError,
  performGrowthAction,
  startExpedition,
} from "./lib/expeditionApi";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  updateCalendarEvent,
} from "./lib/calendarApi";
import {
  completeAdventurerTask,
  createAdventurerTask,
  delegateTaskToQuest,
  deleteAdventurerTask,
  updateAdventurerTask,
} from "./lib/adventurerTaskApi";
import {
  acceptGuildRequest,
  createGuildRequest,
  dismissGuildNotice,
  issueGuildDirective,
  rejectGuildRequest,
  syncDeadlineNotices,
} from "./lib/guildOperationsApi";
import { partitionQuests } from "./lib/questMapper";
import {
  clearSelectedAvatar,
  clearSelectedPlayer,
  loadSelectedAvatar,
  loadSelectedPlayer,
  resolveSelectedPlayer,
  saveSelectedAvatar,
  saveSelectedPlayer,
} from "./lib/playerStorage";
import {
  acceptQuest,
  becomeSuccessor,
  completeQuest,
  deleteQuestRecord,
  editQuestFields,
  reopenQuest,
  requestSuccession,
} from "./lib/questApi";
import { isSupabaseConfigured } from "./lib/supabase";
import { ensureStaffMember } from "./lib/staffApi";
import {
  countMyQuests,
  getQuestBaseExp,
  getQuestGuildExp,
  getPriorityScore,
  isPlayerOnQuest,
  sortCompletedLog,
  sortQuests,
} from "./lib/questUtils";

type NavId =
  | "notebook"
  | "notices"
  | "board"
  | "my"
  | "calendar"
  | "expedition"
  | "stats"
  | "settings";
type MobilePanel = "quests" | "party";
type QuickFilter =
  | "open"
  | "recruiting"
  | "help_wanted"
  | "in_progress"
  | "mine"
  | "completed";
type ToastTone = "success" | "error" | "info";
type Toast = { id: number; message: string; tone: ToastTone };
type DialogueTone = "guild" | "system" | "reward";
type DialogueMessage = {
  id: number;
  speaker: string;
  message: string;
  icon: string;
  tone: DialogueTone;
  avatarType?: string | null;
  lines?: string[];
  durationMs?: number;
};
type CompletionReward = {
  title: string;
  exp: number;
  coins: number;
  guildExp: number;
  tickets?: number;
};
const GUIDE_STORAGE_KEY = "todo-quest-guide-seen";
const GUILD_ACCESS_KEY = "guild_quest_access_granted";
const LEGACY_GUILD_ACCESS_KEY = "guild-quest-access";
const GUILD_CODE = import.meta.env.VITE_GUILD_CODE?.trim() ?? "";
const DIRECT_POST_ESTIMATED_OPTIONS = [
  { value: 10, label: "10分" },
  { value: 15, label: "15分" },
  { value: 30, label: "30分" },
  { value: 60, label: "1時間" },
  { value: 120, label: "2時間" },
  { value: 240, label: "半日" },
  { value: 480, label: "終日" },
] as const;

type ModalState =
  | { type: "closed" }
  | { type: "edit"; questId: number };

type TaskFormState =
  | { type: "closed" }
  | {
      type: "create";
      defaults?: Partial<AdventurerTaskFormData>;
    }
  | { type: "edit"; taskId: number };

type TaskDetailState =
  | { type: "closed" }
  | { type: "open"; taskId: number };

type QuestPublishState =
  | { type: "closed" }
  | { type: "open"; taskId: number };

type DirectQuestPostState = { type: "closed" } | { type: "open" };

type GuildRequestFormState =
  | { type: "closed" }
  | { type: "open"; requestType: GuildRequestType; taskId?: number | null };

type ConfirmState =
  | { type: "closed" }
  | { type: "complete"; questId: number }
  | { type: "delete"; questId: number };

type ReopenState = { type: "closed" } | { type: "open"; questId: number };
type DetailState = { type: "closed" } | { type: "open"; questId: number };
type CalendarFormState =
  | { type: "closed" }
  | { type: "create"; date?: string }
  | { type: "edit"; eventId: number };
type CalendarDetailState =
  | { type: "closed" }
  | { type: "open"; eventId: number };

export default function App() {
  const [hasGuildAccess, setHasGuildAccess] = useState(() => {
    if (typeof localStorage === "undefined") return false;
    const accessGranted =
      localStorage.getItem(GUILD_ACCESS_KEY) === "true" ||
      localStorage.getItem(LEGACY_GUILD_ACCESS_KEY) === "true";
    return accessGranted && loadSelectedPlayer("") !== "";
  });

  const handleGuildEntry = async (playerName: string, avatarType: string) => {
    const member = await ensureStaffMember(playerName, avatarType);
    localStorage.setItem(GUILD_ACCESS_KEY, "true");
    saveSelectedPlayer(member.name);
    saveSelectedAvatar(member.avatarType);
    setHasGuildAccess(true);
  };

  const handleGuildLogout = () => {
    localStorage.removeItem(GUILD_ACCESS_KEY);
    localStorage.removeItem(LEGACY_GUILD_ACCESS_KEY);
    clearSelectedPlayer();
    clearSelectedAvatar();
    setHasGuildAccess(false);
  };

  if (!GUILD_CODE) {
    return <GuildCodeConfigError />;
  }

  if (!hasGuildAccess) {
    return <GuildCodeGate guildCode={GUILD_CODE} onEnter={handleGuildEntry} />;
  }

  return <MainApp onLogout={handleGuildLogout} />;
}

function GuildCodeGate({
  guildCode,
  onEnter,
}: {
  guildCode: string;
  onEnter: (playerName: string, avatarType: string) => Promise<void>;
}) {
  const [inputCode, setInputCode] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [avatarType, setAvatarType] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = playerName.trim();

    if (inputCode.trim() !== guildCode) {
      setError("合言葉が違います");
      return;
    }

    if (!trimmedName) {
      setError("冒険者名を入力してください");
      return;
    }

    if (!avatarType) {
      setError("冒険者を選択してください");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await onEnter(trimmedName, avatarType);
    } catch {
      setError("冒険者登録に失敗しました。少し時間を置いて再度お試しください。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="guild-entry-screen quest-bg h-dvh overflow-y-auto relative flex items-start justify-center px-3 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:items-center sm:px-4 sm:py-5">
      <div className="absolute inset-0 opacity-30 pointer-events-none">
        {[...Array(18)].map((_, i) => (
          <span
            key={i}
            className="absolute w-1 h-1 rounded-full bg-[var(--color-gold)] animate-float"
            style={{
              left: `${8 + ((i * 17) % 84)}%`,
              top: `${8 + ((i * 29) % 78)}%`,
              animationDelay: `${i * 0.23}s`,
              animationDuration: `${3.2 + (i % 4)}s`,
            }}
          />
        ))}
      </div>

      <section className="guild-gate-card rpg-frame w-full max-w-sm px-3 py-3 sm:max-w-md sm:px-5 sm:py-5 animate-fade-up">
        <div className="text-center mb-3 sm:mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 border-2 border-[var(--color-gold-bright)] bg-[var(--color-deep)] mb-2 sm:mb-3 animate-pulse-glow shadow-[3px_3px_0_#000]">
            <span className="text-2xl sm:text-3xl">⚔️</span>
          </div>
          <p className="font-[family-name:var(--font-display)] text-[10px] tracking-[0.28em] text-[var(--color-gold)]/80">
            GUILD ENTRY
          </p>
          <h1 className="pixel-title text-2xl sm:text-3xl font-bold gold-text mt-1">
            ギルドへの入場
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 mt-2 sm:mt-3 leading-5 sm:leading-6">
            「合言葉を知る者だけが、<br className="hidden sm:block" />
            このギルドの扉を開ける。」
          </p>
          <p className="text-[10px] sm:text-xs text-slate-500 mt-1.5 sm:mt-2">
            合言葉と冒険者名を入力し、冒険者を選択してください
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
          <label className="block">
            <span className="block text-xs font-bold text-[var(--color-gold)] tracking-widest mb-2">
              合言葉
            </span>
            <input
              value={inputCode}
              onChange={(event) => {
                setInputCode(event.target.value);
                if (error) setError(null);
              }}
              className="quest-input text-base guild-entry-input"
              placeholder="合言葉"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              disabled={submitting}
              aria-invalid={error ? "true" : "false"}
              aria-describedby={error ? "guild-code-error" : undefined}
            />
          </label>

          <label className="block">
            <span className="block text-xs font-bold text-[var(--color-gold)] tracking-widest mb-2">
              冒険者名
            </span>
            <input
              value={playerName}
              onChange={(event) => {
                setPlayerName(event.target.value);
                if (error) setError(null);
              }}
              className="quest-input text-base guild-entry-input"
              placeholder="例：リオ"
              autoComplete="name"
              maxLength={24}
              disabled={submitting}
            />
          </label>

          <fieldset className="space-y-2">
            <legend className="block text-xs font-bold text-[var(--color-gold)] tracking-widest">
              冒険者を選択
            </legend>
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              {AVATAR_OPTIONS.map((avatar) => {
                const selected = avatarType === avatar.type;
                return (
                  <button
                    key={avatar.type}
                    type="button"
                    onClick={() => {
                      setAvatarType(avatar.type);
                      if (error) setError(null);
                    }}
                    disabled={submitting}
                    className={`avatar-choice tap-card ${
                      selected ? "is-selected" : ""
                    } disabled:opacity-50`}
                    aria-pressed={selected}
                  >
                    <span className="avatar-choice-label">
                      {selected ? "▶ " : ""}
                      {avatar.label}
                    </span>
                    <AvatarSprite
                      avatarType={avatar.type}
                      alt={avatar.label}
                      size="xl"
                      selected={selected}
                    />
                    {selected && (
                      <span className="avatar-choice-selected">選択中</span>
                    )}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {error && (
            <p
              id="guild-code-error"
              className="border-2 border-red-400/55 bg-red-500/10 px-3 py-2 text-sm text-red-200 shadow-[3px_3px_0_#000]"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="quest-btn-primary w-full text-sm disabled:opacity-50"
          >
            ギルドに入場する
          </button>
        </form>

        <p className="mt-3 sm:mt-5 text-center text-[10px] sm:text-[11px] leading-5 text-slate-500">
          本格認証ではなく、ギルドメンバー向けの簡易入口です。
        </p>
      </section>
    </div>
  );
}

function GuildCodeConfigError() {
  return (
    <div className="quest-bg h-dvh overflow-hidden flex items-center justify-center p-6">
      <section className="rpg-frame max-w-md p-6 text-center">
        <p className="text-4xl">⚠️</p>
        <h1 className="pixel-window-title mt-4 text-xl font-bold">
          ギルドコードが設定されていません
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          <code className="text-[var(--color-gold)]">VITE_GUILD_CODE</code>{" "}
          を環境変数に設定してから再起動してください。
        </p>
      </section>
    </div>
  );
}

function MainApp({ onLogout }: { onLogout: () => void }) {
  const { quests, loading, error, reload, findQuest } = useQuests();
  const { staff, loading: staffLoading, reload: reloadStaff } = useStaff();
  const { logs, loading: logsLoading } = useQuestLogs();
  const {
    events: calendarEvents,
    loading: calendarLoading,
    error: calendarError,
    reload: reloadCalendar,
  } = useCalendarEvents();
  const {
    tasks: adventurerTasks,
    loading: tasksLoading,
    error: tasksError,
    reload: reloadTasks,
    findTask,
  } = useAdventurerTasks();
  const {
    notices: guildNotices,
    requests: guildRequests,
    loading: guildOperationsLoading,
    error: guildOperationsError,
    reload: reloadGuildOperations,
  } = useGuildOperations();

  const [selectedPlayer, setSelectedPlayer] = useState(() =>
    loadSelectedPlayer(""),
  );
  const [ownPlayerName, setOwnPlayerName] = useState(() =>
    loadSelectedPlayer(""),
  );
  const {
    resources,
    expeditions,
    loading: expeditionsLoading,
    error: expeditionsError,
    reload: reloadExpeditions,
  } = useExpeditions(selectedPlayer);
  const [nav, setNav] = useState<NavId>("notebook");
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("quests");
  const [modal, setModal] = useState<ModalState>({ type: "closed" });
  const [taskForm, setTaskForm] = useState<TaskFormState>({ type: "closed" });
  const [taskDetail, setTaskDetail] = useState<TaskDetailState>({
    type: "closed",
  });
  const [questPublish, setQuestPublish] = useState<QuestPublishState>({
    type: "closed",
  });
  const [directQuestPost, setDirectQuestPost] =
    useState<DirectQuestPostState>({ type: "closed" });
  const [guildRequestForm, setGuildRequestForm] =
    useState<GuildRequestFormState>({ type: "closed" });
  const [urgentReportSeen, setUrgentReportSeen] = useState(false);
  const announcedRequestIds = useRef<Set<number>>(new Set());
  const [confirm, setConfirm] = useState<ConfirmState>({ type: "closed" });
  const [reopen, setReopen] = useState<ReopenState>({ type: "closed" });
  const [detail, setDetail] = useState<DetailState>({ type: "closed" });
  const [calendarForm, setCalendarForm] = useState<CalendarFormState>({
    type: "closed",
  });
  const [calendarDetail, setCalendarDetail] = useState<CalendarDetailState>({
    type: "closed",
  });
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() =>
    toDateInputValue(new Date()),
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [quickFilter, setQuickFilter] = useState<QuickFilter | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [messageQueue, setMessageQueue] = useState<DialogueMessage[]>([]);
  const [completionBurst, setCompletionBurst] =
    useState<CompletionReward | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [guideOpen, setGuideOpen] = useState(() => {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(GUIDE_STORAGE_KEY) !== "true";
  });
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  const busy = pendingAction != null;

  const selectedMember = useMemo(
    () => staff.find((member) => member.name === selectedPlayer) ?? null,
    [staff, selectedPlayer],
  );

  const ownMember = useMemo(
    () => staff.find((member) => member.name === ownPlayerName) ?? null,
    [ownPlayerName, staff],
  );

  const isGuildOfficer = canIssueDirective(ownMember?.roleLevel);

  const navigateTo = (next: NavId) => {
    if (next === "my" && ownPlayerName) {
      setSelectedPlayer(ownPlayerName);
    }
    setNav(next);
  };

  const staffByName = useMemo(() => {
    return new Map(staff.map((member) => [member.name, member]));
  }, [staff]);

  const currentExpedition = useMemo(
    () => getCurrentExpedition(expeditions),
    [expeditions],
  );

  useEffect(() => {
    if (staff.length === 0) return;
    setSelectedPlayer((prev) =>
      resolveSelectedPlayer(
        prev || loadSelectedPlayer(""),
        staff.map((s) => s.name),
        staff[0].name,
      ),
    );
  }, [staff]);

  useEffect(() => {
    if (ownMember?.avatarType) {
      saveSelectedAvatar(ownMember.avatarType);
    }
  }, [ownMember]);

  useEffect(() => {
    const markOnline = () => setIsOnline(true);
    const markOffline = () => setIsOnline(false);
    window.addEventListener("online", markOnline);
    window.addEventListener("offline", markOffline);
    return () => {
      window.removeEventListener("online", markOnline);
      window.removeEventListener("offline", markOffline);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (tasksLoading || adventurerTasks.length === 0) return;
    void syncDeadlineNotices(adventurerTasks)
      .then(() => reloadGuildOperations())
      .catch(() => {
        enqueueMessage({
          speaker: "システム",
          message: "ギルド速報の更新に失敗しました。",
          icon: "⚙️",
          tone: "system",
          durationMs: 2200,
        });
      });
  }, [adventurerTasks, tasksLoading, reloadGuildOperations]);

  const closeGuide = () => {
    setGuideOpen(false);
    localStorage.setItem(GUIDE_STORAGE_KEY, "true");
  };

  const addToast = (message: string, tone: ToastTone = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-3), { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, tone === "error" ? 4800 : 2800);
  };

  const enqueueMessage = (message: Omit<DialogueMessage, "id">) => {
    const id = Date.now() + Math.random();
    setMessageQueue((prev) => [...prev, { id, ...message }]);
  };

  const enqueueGuildMessage = (
    message: string,
    options?: Partial<Omit<DialogueMessage, "id" | "speaker" | "message">>,
  ) => {
    enqueueMessage({
      speaker: "ギルド受付",
      message,
      icon: "🧙",
      tone: "guild",
      avatarType:
        selectedMember?.avatarType ?? loadSelectedAvatar(DEFAULT_AVATAR_TYPE),
      durationMs: 2200,
      ...options,
    });
  };

  const dismissMessage = () => {
    setMessageQueue((prev) => prev.slice(1));
  };

  const activeMessage = messageQueue[0] ?? null;

  useEffect(() => {
    if (!activeMessage) return;

    const timeout = window.setTimeout(() => {
      setMessageQueue((prev) => prev.slice(1));
    }, activeMessage.durationMs ?? 2200);

    return () => window.clearTimeout(timeout);
  }, [activeMessage]);

  useEffect(() => {
    if (messageQueue.length === 0) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      setMessageQueue((prev) => prev.slice(1));
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [messageQueue.length]);

  const { active: activeQuests, completed: completedHistory } = useMemo(
    () => partitionQuests(quests),
    [quests],
  );

  const myPagePlayer = ownPlayerName || selectedPlayer;
  const myQuestCount = countMyQuests(activeQuests, myPagePlayer);

  const baseActive = useMemo(() => {
    return nav === "my"
      ? activeQuests.filter((q) => isPlayerOnQuest(q, myPagePlayer))
      : activeQuests;
  }, [activeQuests, myPagePlayer, nav]);

  const sortedActive = useMemo(() => {
    const filtered =
      quickFilter === "open"
        ? baseActive.filter((q) => q.status === "open")
        : quickFilter === "recruiting"
          ? baseActive.filter((q) => q.status === "recruiting")
          : quickFilter === "help_wanted"
            ? baseActive.filter((q) => q.status === "help_wanted")
            : quickFilter === "in_progress"
              ? baseActive.filter((q) => q.status === "in_progress")
              : quickFilter === "mine"
                ? baseActive.filter((q) => isPlayerOnQuest(q, myPagePlayer))
                : quickFilter === "completed"
                  ? []
                  : baseActive;
    return nav === "my" ? sortMyPageQuests(filtered) : sortQuests(filtered);
  }, [baseActive, myPagePlayer, nav, quickFilter]);

  const sortedCompleted = useMemo(() => {
    const completed =
      nav === "my"
        ? completedHistory.filter((entry) =>
            isPlayerOnQuest(entry.quest, myPagePlayer),
          )
        : completedHistory;
    return sortCompletedLog(completed);
  }, [completedHistory, myPagePlayer, nav]);

  const recommendedQuest = useMemo(() => {
    const candidates = activeQuests.filter(
      (q) =>
        q.status === "open" ||
        q.status === "recruiting" ||
        q.status === "help_wanted",
    );
    return sortQuests(candidates)[0] ?? null;
  }, [activeQuests]);

  const guildProgress = useMemo(() => {
    const today = new Date().toLocaleDateString("ja-JP");
    const todayEntries = completedHistory.filter((entry) => {
      return new Date(entry.completedAt).toLocaleDateString("ja-JP") === today;
    });
    const todayExp = todayEntries.reduce(
      (sum, entry) => sum + getQuestGuildExp(entry.quest),
      0,
    );
    const rankProgress = Math.min(100, Math.round((todayExp / 1200) * 100));
    return {
      completedCount: todayEntries.length,
      exp: todayExp,
      rankProgress,
    };
  }, [completedHistory]);

  const openCount = activeQuests.filter((q) => q.status === "open").length;
  const recruitingCount = activeQuests.filter(
    (q) => q.status === "recruiting",
  ).length;
  const helpWantedCount = activeQuests.filter(
    (q) => q.status === "help_wanted",
  ).length;
  const inProgressCount = activeQuests.filter(
    (q) => q.status === "in_progress",
  ).length;
  const filterCounts: Record<QuickFilter, number> = {
    open: baseActive.filter((q) => q.status === "open").length,
    recruiting: baseActive.filter((q) => q.status === "recruiting").length,
    help_wanted: baseActive.filter((q) => q.status === "help_wanted").length,
    in_progress: baseActive.filter((q) => q.status === "in_progress").length,
    mine: activeQuests.filter((q) => isPlayerOnQuest(q, myPagePlayer)).length,
    completed: sortedCompleted.length,
  };

  const editingQuest =
    modal.type === "edit" ? findQuest(modal.questId) ?? null : null;

  const confirmQuest =
    confirm.type !== "closed" ? findQuest(confirm.questId) : null;

  const reopenQuestData =
    reopen.type === "open" ? findQuest(reopen.questId) ?? null : null;

  const detailQuest =
    detail.type === "open" ? findQuest(detail.questId) ?? null : null;

  const calendarEventById = useMemo(() => {
    return new Map(calendarEvents.map((event) => [event.id, event]));
  }, [calendarEvents]);

  const taskByQuestId = useMemo(() => {
    const map = new Map<number, AdventurerTask>();
    for (const task of adventurerTasks) {
      if (task.questId != null) map.set(task.questId, task);
    }
    return map;
  }, [adventurerTasks]);

  const editingCalendarEvent =
    calendarForm.type === "edit"
      ? calendarEventById.get(calendarForm.eventId) ?? null
      : null;

  const detailCalendarEvent =
    calendarDetail.type === "open"
      ? calendarEventById.get(calendarDetail.eventId) ?? null
      : null;

  const visibleTasks = useMemo(() => {
    const viewingOwnNotebook = selectedPlayer === ownPlayerName;
    return adventurerTasks.filter((task) => {
      if (task.ownerName !== selectedPlayer) return false;
      return viewingOwnNotebook || task.isPublic;
    });
  }, [adventurerTasks, ownPlayerName, selectedPlayer]);

  const selectedPlayerTasks = useMemo(() => {
    return visibleTasks;
  }, [visibleTasks]);

  const canManageSelectedTasks = selectedPlayer === ownPlayerName;

  const ownPlayerTasks = useMemo(() => {
    return adventurerTasks.filter((task) => task.ownerName === ownPlayerName);
  }, [adventurerTasks, ownPlayerName]);

  const ownTodayTasks = useMemo(() => {
    return sortAdventurerTasks(
      filterTasksByTab(
        ownPlayerTasks.filter((task) => task.status !== "completed"),
        "today",
      ),
    );
  }, [ownPlayerTasks]);

  const editingTask =
    taskForm.type === "edit" ? findTask(taskForm.taskId) ?? null : null;

  const detailTask =
    taskDetail.type === "open" ? findTask(taskDetail.taskId) ?? null : null;

  const publishingTask =
    questPublish.type === "open" ? findTask(questPublish.taskId) ?? null : null;

  const guildRequestSourceTask =
    guildRequestForm.type === "open" && guildRequestForm.taskId != null
      ? findTask(guildRequestForm.taskId) ?? null
      : null;

  const taskDashboard = useMemo(() => {
    const activeTasks = selectedPlayerTasks.filter(
      (task) => task.status !== "completed",
    );
    const todayTasks = filterTasksByTab(activeTasks, "today");
    const dueSoon = activeTasks.filter((task) => {
      const tone = getTaskDueTone(task);
      return tone === "overdue" || tone === "today" || tone === "soon";
    });
    const delegated = activeTasks.filter((task) => task.status === "delegated");
    const readyExpeditions = expeditions.filter((expedition) =>
      isExpeditionReady(expedition, now),
    );
    const unclaimedRewards = expeditions.filter(
      (expedition) =>
        expedition.status === "completed" && isExpeditionReady(expedition, now),
    );
    const receivedRequests = guildRequests.filter(
      (request) =>
        request.toPlayer === ownPlayerName &&
        request.status === "pending" &&
        request.requestType === "assignment",
    );
    const receivedSuggestions = guildRequests.filter(
      (request) =>
        request.toPlayer === ownPlayerName &&
        request.status === "pending" &&
        request.requestType === "suggestion",
    );
    const receivedDirectives = guildRequests.filter(
      (request) =>
        request.toPlayer === ownPlayerName &&
        request.requestType === "directive" &&
        request.status !== "rejected",
    );

    return {
      today: todayTasks.length,
      dueSoon: dueSoon.length,
      delegated: delegated.length,
      receivedRequests: receivedRequests.length,
      receivedSuggestions: receivedSuggestions.length,
      directives: receivedDirectives.length,
      expeditionReturns: readyExpeditions.length,
      unclaimedRewards: unclaimedRewards.length,
    };
  }, [expeditions, guildRequests, now, ownPlayerName, selectedPlayerTasks]);

  const relevantNotices = useMemo(() => {
    return guildNotices.filter(
      (notice) =>
        !notice.dismissed &&
        (!notice.targetPlayer ||
          notice.targetPlayer === ownPlayerName ||
          isGuildOfficer),
    );
  }, [guildNotices, isGuildOfficer, ownPlayerName]);

  const receivedGuildRequests = useMemo(() => {
    return guildRequests.filter(
      (request) =>
        request.toPlayer === ownPlayerName &&
        (request.status === "pending" ||
          (request.requestType === "directive" && request.status !== "rejected")),
    );
  }, [guildRequests, ownPlayerName]);

  const urgentReport = useMemo(() => {
    const activeTasks = ownPlayerTasks.filter(
      (task) => task.status !== "completed",
    );
    const overdue = activeTasks.filter(
      (task) => getDeadlineWarningLevel(task) === "overdue",
    );
    const dueSoon = activeTasks.filter((task) => {
      const level = getDeadlineWarningLevel(task);
      return level === "within24h" || level === "within12h" || level === "within3h";
    });
    return {
      overdue,
      dueSoon,
      shouldShow: !urgentReportSeen && (overdue.length > 0 || dueSoon.length > 0),
    };
  }, [ownPlayerTasks, urgentReportSeen]);

  useEffect(() => {
    for (const request of guildRequests) {
      if (
        request.toPlayer !== ownPlayerName ||
        (request.requestType === "directive"
          ? request.status === "rejected"
          : request.status !== "pending") ||
        announcedRequestIds.current.has(request.id)
      ) {
        continue;
      }

      announcedRequestIds.current.add(request.id);
      enqueueGuildMessage(
        request.requestType === "suggestion"
          ? "助言が届いています。"
          : request.requestType === "assignment"
            ? "新たな依頼が届きました。"
            : "ギルド指令が発令されました。",
        {
          durationMs: 2600,
        },
      );
    }
  }, [guildRequests, ownPlayerName]);

  const runAction = async <T,>(
    key: string,
    fn: () => Promise<T>,
    successMessage: string | null,
    onSuccess?: (result: T) => void,
  ) => {
    if (pendingAction) return;
    setActionError(null);
    setPendingAction(key);
    try {
      const result = await fn();
      onSuccess?.(result);
      if (successMessage) addToast(successMessage);
    } catch (e) {
      const message = "通信魔法に失敗しました。少し時間を置いて再度お試しください。";
      setActionError(message);
      enqueueMessage({
        speaker: "システム",
        message,
        icon: "⚙️",
        tone: "system",
        durationMs: 3200,
      });
    } finally {
      setPendingAction(null);
    }
  };

  const handleAccept = (questId: number) => {
    const quest = findQuest(questId);
    if (!quest || !selectedPlayer) return;
    const linkedTask = taskByQuestId.get(quest.id);
    const shouldAnnounceTransfer =
      quest.participants.length === 0 &&
      linkedTask != null &&
      linkedTask.ownerName !== selectedPlayer;
    void runAction(
      `accept-${questId}`,
      () => acceptQuest(quest, selectedPlayer),
      null,
      (updated) => {
        enqueueGuildMessage(
          `${selectedPlayer} が『${updated.title}』に参加しました！`,
          { icon: selectedMember?.avatar ?? "🧙" },
        );
        if (shouldAnnounceTransfer) {
          enqueueGuildMessage(
            `任務が ${selectedPlayer} に引き継がれました！`,
            { icon: selectedMember?.avatar ?? "🧙" },
          );
        }
      },
    );
  };

  const handleBecomeSuccessor = (questId: number) => {
    const quest = findQuest(questId);
    if (!quest || !selectedPlayer) return;
    const linkedTask = taskByQuestId.get(quest.id);
    const shouldAnnounceTransfer =
      quest.participants.length === 0 &&
      linkedTask != null &&
      linkedTask.ownerName !== selectedPlayer;
    void runAction(
      `successor-${questId}`,
      () => becomeSuccessor(quest, selectedPlayer),
      null,
      (updated) => {
        enqueueGuildMessage(
          `${selectedPlayer} が『${updated.title}』に参加しました！`,
          { icon: selectedMember?.avatar ?? "🧙" },
        );
        if (shouldAnnounceTransfer) {
          enqueueGuildMessage(
            `任務が ${selectedPlayer} に引き継がれました！`,
            { icon: selectedMember?.avatar ?? "🧙" },
          );
        }
      },
    );
  };

  const handleRequestSuccession = (questId: number) => {
    const quest = findQuest(questId);
    if (!quest || !selectedPlayer) return;
    void runAction(
      `succession-${questId}`,
      () => requestSuccession(quest, selectedPlayer),
      null,
      (updated) => {
        enqueueGuildMessage(
          `『${updated.title}』で助っ人を募集しています！`,
        );
      },
    );
  };

  const handleEditQuest = (data: QuestFormData) => {
    if (modal.type !== "edit" || !selectedPlayer) return;
    const quest = findQuest(modal.questId);
    if (!quest) return;
    void runAction(
      `edit-${quest.id}`,
      () => editQuestFields(quest, data, selectedPlayer),
      "クエスト内容を更新しました。",
    );
  };

  const executeComplete = () => {
    if (confirm.type !== "complete" || !confirmQuest || !selectedPlayer) return;
    const quest = confirmQuest;
    const exp = getQuestBaseExp(quest);
    const coins = Math.max(10, Math.floor(exp / 2));
    const guildExp = getQuestGuildExp(quest);
    const tickets = getTicketsForRank(getPriorityScore(quest));
    setConfirm({ type: "closed" });
    void runAction(
      `complete-${quest.id}`,
      () => completeQuest(quest, selectedPlayer),
      null,
      () => {
        setCompletionBurst({ title: quest.title, exp, coins, guildExp, tickets });
        enqueueGuildMessage(`『${quest.title}』を達成しました！`, {
          durationMs: 1900,
        });
        enqueueMessage({
          speaker: "報酬",
          message: "クエスト達成！",
          icon: "🎁",
          tone: "reward",
          avatarType:
            selectedMember?.avatarType ?? loadSelectedAvatar(DEFAULT_AVATAR_TYPE),
          lines: [
            `EXP +${exp}`,
            `GOLD +${coins}`,
            `ギルドEXP +${guildExp}`,
            `遠征チケット +${tickets}`,
          ],
          durationMs: 3000,
        });
        window.setTimeout(() => setCompletionBurst(null), 1800);
        void reloadStaff();
        void reloadExpeditions();
      },
    );
  };

  const handleStartExpedition = (destination: ExpeditionDestination) => {
    if (!selectedPlayer || pendingAction) return;

    setActionError(null);
    setPendingAction(`expedition-start-${destination.key}`);
    void startExpedition(selectedPlayer, destination, selectedMember?.level ?? 1)
      .then((expedition) => {
        enqueueGuildMessage(
          `${selectedPlayer} は『${expedition.expeditionName}』へ出発しました！`,
          { icon: destination.icon, durationMs: 2600 },
        );
        void reloadExpeditions();
      })
      .catch((e) => {
        const message =
          e instanceof ExpeditionError
            ? e.message
            : "通信魔法に失敗しました。少し時間を置いて再度お試しください。";
        setActionError(message);
        enqueueMessage({
          speaker: "システム",
          message,
          icon: "⚙️",
          tone: "system",
          durationMs: 2800,
        });
      })
      .finally(() => setPendingAction(null));
  };

  const handleClaimExpedition = (expedition: Expedition) => {
    if (!selectedPlayer || pendingAction) return;

    const previousLevel = selectedMember?.level ?? 1;

    setActionError(null);
    setPendingAction(`expedition-claim-${expedition.id}`);
    void claimExpeditionReward(expedition, selectedPlayer)
      .then(({ expedition: claimedExpedition }) => {
        const nextLevel =
          Math.floor(
            ((selectedMember?.exp ?? 0) + claimedExpedition.rewardExp) / 100,
          ) + 1;
        const itemLines = formatRewardItems(claimedExpedition.rewardMaterials);
        const success = claimedExpedition.result === "success";
        enqueueGuildMessage(
          success
            ? `${selectedPlayer} が遠征に成功しました！`
            : `${selectedPlayer} は遠征から撤退しました。`,
          { durationMs: 1900 },
        );
        enqueueMessage({
          speaker: success ? "遠征成功" : "遠征失敗",
          message: success
            ? `${claimedExpedition.expeditionName}を探索した！`
            : `${claimedExpedition.expeditionName}から撤退した……`,
          icon: success ? "🎁" : "⚠️",
          tone: "reward",
          avatarType:
            selectedMember?.avatarType ?? loadSelectedAvatar(DEFAULT_AVATAR_TYPE),
          lines: [
            `成功率 ${claimedExpedition.successRate ?? "-"}%`,
            `EXP +${claimedExpedition.rewardExp}`,
            `GOLD +${claimedExpedition.rewardGold}`,
            claimedExpedition.rewardGuildExp > 0
              ? `ギルドEXP +${claimedExpedition.rewardGuildExp}`
              : "",
            success ? "熟練度 +5" : "疲労 +10",
            ...itemLines,
          ].filter(Boolean),
          durationMs: 3600,
        });
        if (nextLevel > previousLevel) {
          enqueueGuildMessage(`${selectedPlayer} は Lv.${nextLevel} に上がりました！`, {
            durationMs: 2600,
          });
        }
        addToast(success ? "遠征に成功しました。" : "遠征は失敗しましたが、経験を得ました。");
        void reloadStaff();
        void reloadExpeditions();
      })
      .catch((e) => {
        const message =
          e instanceof ExpeditionError
            ? e.message
            : "通信魔法に失敗しました。少し時間を置いて再度お試しください。";
        setActionError(message);
        enqueueMessage({
          speaker: "システム",
          message,
          icon: "⚙️",
          tone: "system",
          durationMs: 2800,
        });
      })
      .finally(() => setPendingAction(null));
  };

  const handleGrowthAction = (action: GrowthAction) => {
    if (!selectedPlayer || pendingAction) return;

    setActionError(null);
    setPendingAction(`growth-${action}`);
    void performGrowthAction(selectedPlayer, action)
      .then(() => {
        const message =
          action === "train_proficiency"
            ? "訓練を行いました。熟練度が上がりました！"
            : action === "rest_tavern"
              ? "酒場で休息しました。疲労が回復しました！"
              : action === "guild_meeting"
                ? "ギルド集会に参加しました。信頼度が上がりました！"
                : "装備を整備しました。耐久が回復しました！";
        enqueueGuildMessage(message, { durationMs: 2300 });
        addToast(GROWTH_ACTION_LABELS[action]);
        void reloadExpeditions();
      })
      .catch(() => {
        const message =
          "通信魔法に失敗しました。少し時間を置いて再度お試しください。";
        setActionError(message);
        enqueueMessage({
          speaker: "システム",
          message,
          icon: "⚙️",
          tone: "system",
          durationMs: 2800,
        });
      })
      .finally(() => setPendingAction(null));
  };

  const handleSubmitCalendarEvent = (data: CalendarEventFormData) => {
    if (!selectedPlayer) return;
    const isEdit = calendarForm.type === "edit";
    const eventId = isEdit ? calendarForm.eventId : null;

    void runAction(
      isEdit ? `calendar-edit-${eventId}` : "calendar-create",
      () =>
        isEdit && eventId != null
          ? updateCalendarEvent(eventId, data, selectedPlayer)
          : createCalendarEvent(data, selectedPlayer),
      null,
      (saved) => {
        setCalendarForm({ type: "closed" });
        setSelectedCalendarDate(saved.eventDate);
        setCalendarMonth(parseDateInput(saved.eventDate));
        enqueueGuildMessage(
          isEdit
            ? "予定を更新しました。"
            : "新しい予定がギルド暦に記されました。",
        );
        if (saved.linkedQuestId != null) {
          enqueueGuildMessage("依頼と予定を関連付けました。", {
            durationMs: 2200,
          });
        }
        void reloadCalendar();
        void reload();
      },
    );
  };

  const handleDeleteCalendarEvent = (event: CalendarEvent) => {
    if (!selectedPlayer) return;

    void runAction(
      `calendar-delete-${event.id}`,
      () => deleteCalendarEvent(event, selectedPlayer),
      null,
      () => {
        setCalendarDetail({ type: "closed" });
        setCalendarForm({ type: "closed" });
        enqueueGuildMessage("予定を削除しました。");
        void reloadCalendar();
        void reload();
      },
    );
  };

  const handleSubmitTask = (data: AdventurerTaskFormData) => {
    if (!selectedPlayer) return;
    const isEdit = taskForm.type === "edit";
    const taskId = isEdit ? taskForm.taskId : null;
    const task = taskId != null ? findTask(taskId) ?? null : null;

    void runAction(
      isEdit ? `task-edit-${taskId}` : "task-create",
      () =>
        isEdit && task
          ? updateAdventurerTask(task, data, selectedPlayer)
          : createAdventurerTask(data, selectedPlayer),
      null,
      (saved) => {
        setTaskForm({ type: "closed" });
        enqueueGuildMessage(
          isEdit
            ? "手帳の任務を更新しました。"
            : "新しい任務を冒険者手帳に記しました。",
          { durationMs: 2200 },
        );
        if (saved.dueDate) {
          enqueueGuildMessage("任務をギルド暦の任務欄に反映しました。", {
            durationMs: 2200,
          });
        }
        void reloadTasks();
        void reloadCalendar();
      },
    );
  };

  const handleDelegateTask = (taskId: number) => {
    const task = findTask(taskId);
    if (!task || !selectedPlayer) return;
    setQuestPublish({ type: "open", taskId });
  };

  const handlePublishQuest = (data: QuestPublishFormData) => {
    if (questPublish.type !== "open" || !selectedPlayer) return;
    const task = findTask(questPublish.taskId);
    if (!task) return;
    void runAction(
      `task-delegate-${questPublish.taskId}`,
      () => delegateTaskToQuest(task, selectedPlayer, data),
      null,
      ({ quest }) => {
        setQuestPublish({ type: "closed" });
        enqueueGuildMessage(`『${quest.title}』をギルドへ依頼しました！`, {
          durationMs: 2400,
        });
        void reloadTasks();
        void reloadCalendar();
        void reload();
      },
    );
  };

  const handleDirectQuestPost = (data: DirectQuestPostFormData) => {
    if (!selectedPlayer || pendingAction) return;
    setActionError(null);
    setPendingAction("direct-quest-post");
    void (async () => {
      let createdTask: AdventurerTask;
      try {
        createdTask = await createAdventurerTask(
          {
            title: data.title,
            description: data.description,
            priority: data.urgency,
            importance: data.importance,
            dueDate: data.dueDate,
            calendarEventId: data.calendarEventId,
            isPublic: true,
          },
          data.requesterName,
        );
      } catch {
        throw new Error("任務の記録に失敗しました。");
      }

      try {
        const { quest } = await delegateTaskToQuest(createdTask, selectedPlayer, {
          title: data.title,
          description: data.description,
          difficulty: data.difficulty,
          estimatedMinutes: data.estimatedMinutes,
          dueDate: data.dueDate,
          dueTime: data.dueTime,
          requiredMembers: data.requiredMembers,
        });
        await insertQuestLog({
          questId: quest.id,
          questTitle: quest.title,
          action: "direct_quest_posted",
          actorName: selectedPlayer,
          details: `${selectedPlayer}が『${quest.title}』をギルドへ直掲示しました。`,
        });
        return quest;
      } catch {
        throw new Error("依頼書の掲示に失敗しました。");
      }
    })()
      .then(() => {
        setDirectQuestPost({ type: "closed" });
        enqueueGuildMessage("新しい依頼がギルドに掲示されました！");
        void reloadTasks();
        void reload();
        void reloadCalendar();
      })
      .catch((error) => {
        const message =
          error instanceof Error
            ? error.message
            : "通信魔法に失敗しました。少し時間を置いて再度お試しください。";
        setActionError(message);
        enqueueMessage({
          speaker: "システム",
          message,
          icon: "⚙️",
          tone: "system",
          durationMs: 3000,
        });
      })
      .finally(() => setPendingAction(null));
  };

  const handleCompleteTask = (taskId: number) => {
    const task = findTask(taskId);
    if (!task || !selectedPlayer) return;
    const exp = getTaskBaseExp(task);
    const tickets = getTicketsForRank(getTaskScore(task));

    void runAction(
      `task-complete-${taskId}`,
      () => completeAdventurerTask(task, selectedPlayer),
      null,
      (updated) => {
        setCompletionBurst({
          title: updated.title,
          exp,
          coins: Math.max(10, Math.floor(exp / 2)),
          guildExp: Math.floor(exp * 0.5),
          tickets,
        });
        enqueueGuildMessage(`『${updated.title}』を達成しました！`, {
          durationMs: 1900,
        });
        enqueueMessage({
          speaker: "報酬",
          message: "任務達成！",
          icon: "🎁",
          tone: "reward",
          avatarType:
            selectedMember?.avatarType ?? loadSelectedAvatar(DEFAULT_AVATAR_TYPE),
          lines: [
            `EXP +${exp}`,
            `GOLD +${Math.max(10, Math.floor(exp / 2))}`,
            `遠征チケット +${tickets}`,
          ],
          durationMs: 2800,
        });
        window.setTimeout(() => setCompletionBurst(null), 1800);
        void reloadTasks();
        void reloadStaff();
        void reloadExpeditions();
      },
    );
  };

  const handleDeleteTask = (taskId: number) => {
    const task = findTask(taskId);
    if (!task || !selectedPlayer) return;

    void runAction(
      `task-delete-${taskId}`,
      () => deleteAdventurerTask(task, selectedPlayer),
      null,
      () => {
        setTaskDetail({ type: "closed" });
        enqueueGuildMessage("手帳の記録を削除しました。", {
          durationMs: 2200,
        });
        void reloadTasks();
      },
    );
  };

  const handleSubmitGuildRequest = (data: GuildRequestFormData) => {
    if (!selectedPlayer) return;
    const sourceTask =
      guildRequestForm.type === "open" && guildRequestForm.taskId != null
        ? findTask(guildRequestForm.taskId) ?? null
        : null;

    if (data.requestType === "directive") {
      if (!isGuildOfficer) {
        enqueueMessage({
          speaker: "システム",
          message: "ギルド指令はサブマスター以上のみ発令できます。",
          icon: "⚙️",
          tone: "system",
          durationMs: 2600,
        });
        return;
      }

      const targetPlayers =
        data.toPlayer === "__all__"
          ? staff
              .filter((member) => member.isActive !== false)
              .map((member) => member.name)
          : [data.toPlayer];

      void runAction(
        "guild-directive",
        () =>
          issueGuildDirective(
            data,
            selectedPlayer,
            targetPlayers,
            sourceTask?.id ?? null,
          ),
        null,
        () => {
          setGuildRequestForm({ type: "closed" });
          enqueueGuildMessage("ギルド指令が発令されました。", {
            durationMs: 2600,
          });
          void reloadGuildOperations();
          void reloadTasks();
        },
      );
      return;
    }

    void runAction(
      `guild-request-${data.requestType}`,
      () => createGuildRequest(data, selectedPlayer, sourceTask?.id ?? null),
      null,
      () => {
        setGuildRequestForm({ type: "closed" });
        enqueueGuildMessage(
          data.requestType === "suggestion"
            ? "助言を送りました。"
            : "指名依頼を送りました。",
          { durationMs: 2200 },
        );
        void reloadGuildOperations();
      },
    );
  };

  const handleAcceptGuildRequest = (request: GuildRequest) => {
    if (!selectedPlayer) return;
    void runAction(
      `guild-request-accept-${request.id}`,
      () => acceptGuildRequest(request, selectedPlayer),
      null,
      () => {
        enqueueGuildMessage("任務を受諾しました。", { durationMs: 2200 });
        void reloadGuildOperations();
        void reloadTasks();
        void reload();
      },
    );
  };

  const handleRejectGuildRequest = (request: GuildRequest) => {
    if (!selectedPlayer) return;
    void runAction(
      `guild-request-reject-${request.id}`,
      () => rejectGuildRequest(request, selectedPlayer),
      null,
      () => {
        enqueueGuildMessage("提案を却下しました。", { durationMs: 2200 });
        void reloadGuildOperations();
      },
    );
  };

  const handleDismissNotice = (noticeId: number) => {
    void runAction(
      `notice-dismiss-${noticeId}`,
      () => dismissGuildNotice(noticeId),
      null,
      () => {
        void reloadGuildOperations();
      },
    );
  };

  const executeDelete = () => {
    if (confirm.type !== "delete" || !confirmQuest || !selectedPlayer) return;
    const quest = confirmQuest;
    setConfirm({ type: "closed" });
    void runAction(
      `delete-${quest.id}`,
      () => deleteQuestRecord(quest, selectedPlayer),
      null,
      () => {
        enqueueGuildMessage("依頼書を取り下げました。");
      },
    );
  };

  const executeReopen = (reason: string) => {
    if (reopen.type !== "open" || !selectedPlayer) return;
    const quest = findQuest(reopen.questId);
    if (!quest) return;
    setReopen({ type: "closed" });
    void runAction(
      `reopen-${quest.id}`,
      () => reopenQuest(quest, selectedPlayer, reason),
      "クエストを再掲しました。",
    );
  };

  const handleRenamePlayer = async (name: string) => {
    const nextName = name.trim();
    if (!nextName) throw new Error("冒険者名を入力してください");
    if (pendingAction) return;

    setActionError(null);
    setPendingAction("rename-player");
    try {
      const member = await ensureStaffMember(
        nextName,
        selectedMember?.avatarType ?? loadSelectedAvatar(DEFAULT_AVATAR_TYPE),
      );
      saveSelectedPlayer(member.name);
      saveSelectedAvatar(member.avatarType);
      setOwnPlayerName(member.name);
      setSelectedPlayer(member.name);
      await reloadStaff();
      addToast("操作中の冒険者を変更しました。");
    } catch (e) {
      const message = "冒険者名の変更に失敗しました。少し時間を置いて再度お試しください。";
      setActionError(message);
      addToast(message, "error");
      throw e;
    } finally {
      setPendingAction(null);
    }
  };

  const boardDisabled =
    busy ||
    loading ||
    tasksLoading ||
    guildOperationsLoading ||
    staffLoading ||
    !selectedPlayer ||
    !isOnline;

  if (!isSupabaseConfigured) {
    return <ConfigError />;
  }

  return (
    <div className="quest-bg h-dvh overflow-hidden relative">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        {[...Array(12)].map((_, i) => (
          <span
            key={i}
            className="absolute w-1 h-1 rounded-full bg-[var(--color-gold)]/30 animate-float"
            style={{
              left: `${8 + (i * 7) % 85}%`,
              top: `${10 + (i * 11) % 80}%`,
              animationDelay: `${i * 0.4}s`,
              animationDuration: `${3 + (i % 3)}s`,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 flex h-full min-h-0 flex-col max-w-[1600px] mx-auto">
        {(!isOnline || error || actionError || expeditionsError || calendarError || tasksError || guildOperationsError) && (
          <div className="mx-4 mt-3 lg:mx-4 lg:mt-0 px-4 py-2 border-2 border-red-400/55 bg-red-500/10 text-red-200 text-xs sm:text-sm flex flex-wrap items-center justify-between gap-2 shadow-[3px_3px_0_#000]">
            <span>
              {!isOnline
                ? "通信がオフラインのようです。接続が戻るまで操作を一時停止しています。"
                : actionError ?? expeditionsError ?? calendarError ?? tasksError ?? guildOperationsError ?? "通信魔法に失敗しました。少し時間を置いて再度お試しください。"}
            </span>
            {error && (
              <button
                type="button"
                onClick={() => reload()}
                className="min-h-11 px-2 text-red-300 underline text-xs shrink-0"
              >
                再試行
              </button>
            )}
          </div>
        )}

        <GameHud
          selectedMember={selectedMember}
          selectedPlayer={selectedPlayer}
          guildProgress={guildProgress}
        />

        <header className="mobile-top-hud lg:hidden z-20 m-2 mb-0 px-2.5 py-1.5 rpg-frame bg-[var(--color-panel)] shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex items-center gap-2">
              <AvatarSprite
                avatarType={selectedMember?.avatarType}
                fallback={selectedMember?.avatar ?? "⚔️"}
                alt={selectedMember?.name ?? selectedPlayer ?? "冒険者"}
                frame={selectedMember?.avatarFrame ?? "bronze"}
                size="xs"
                className="mobile-header-avatar"
              />
              <div className="min-w-0">
                <h1 className="pixel-title text-base font-bold gold-text leading-tight">
                  ギルドクエスト
                </h1>
                <p className="text-[10px] text-slate-400 tracking-wider truncate">
                  操作中: <span className="text-[var(--color-gold-bright)]">{selectedPlayer || "未選択"}</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setGuideOpen(true)}
                className="quest-btn-ghost mobile-icon-command px-2 text-xs"
                aria-label="使い方"
              >
                ?
              </button>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="quest-btn-ghost mobile-icon-command px-2 text-xs"
                aria-label="設定"
              >
                ⚙
              </button>
              <button
                type="button"
                onClick={() =>
                  nav === "board"
                    ? setDirectQuestPost({ type: "open" })
                    : setTaskForm({ type: "create" })
                }
                disabled={boardDisabled}
                className="quest-btn-primary mobile-post-command text-xs px-2.5 py-1.5 disabled:opacity-50"
              >
                {nav === "board" ? "掲示" : "任務"}
              </button>
            </div>
          </div>
        </header>

        <div className="game-playfield min-h-0 flex-1 overflow-hidden flex flex-col lg:flex-row gap-0 lg:gap-3 p-0 lg:p-2">
          <Sidebar
            active={nav}
            onNavigate={navigateTo}
            quickFilter={quickFilter}
            onQuickFilter={(filter) => {
              setQuickFilter(filter);
              setMobilePanel("quests");
            }}
            myQuestCount={myQuestCount}
            activeQuestCount={activeQuests.length}
            onOpenGuide={() => setGuideOpen(true)}
            className="hidden lg:flex lg:w-56 xl:w-60 shrink-0 h-full min-h-0"
          />

          <main
            className={`flex-1 min-h-0 overflow-hidden flex flex-col min-w-0 px-3 py-2 lg:px-0 lg:py-0 ${
              mobilePanel === "party" ? "hidden lg:flex" : "flex"
            }`}
          >
            <div className="mb-1.5 shrink-0">
              <div className="rpg-frame board-hero px-2.5 py-1.5 sm:px-3 sm:py-2 overflow-hidden">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="hidden sm:block font-[family-name:var(--font-display)] text-[10px] tracking-[0.24em] text-[var(--color-gold)]/80">
                      GUILD BOARD
                    </p>
                    <h2 className="pixel-window-title text-sm sm:text-xl font-bold">
                      {quickFilter === "help_wanted"
                        ? "助っ人募集"
                        : quickFilter === "completed"
                          ? "完了ログ"
                          : quickFilter === "open"
                            ? "未受注依頼"
                            : quickFilter === "recruiting"
                              ? "募集中"
                              : quickFilter === "in_progress"
                                ? "挑戦中"
                              : quickFilter === "mine"
                                ? "自分の依頼"
                                : nav === "notebook"
                                  ? "本日の任務"
                                  : nav === "notices"
                                    ? "ギルド速報"
                                  : nav === "board"
                        ? "ギルド依頼"
                        : nav === "my"
                          ? "自分の依頼"
                          : nav === "calendar"
                            ? "ギルド暦"
                          : nav === "expedition"
                            ? "遠征"
                          : nav === "settings"
                              ? "設定"
                              : "ギルドの記録"}
                    </h2>
                    <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 truncate">
                      {nav === "settings"
                          ? `操作中の冒険者 ${selectedPlayer || "未選択"}`
                          : nav === "notebook"
                            ? `${selectedPlayer === ownPlayerName ? "自分" : selectedPlayer || "冒険者"}の任務 · ${selectedPlayerTasks.length}件`
                            : nav === "notices"
                              ? `受信 ${receivedGuildRequests.length}件 · 警報 ${relevantNotices.length}件`
                          : nav === "calendar"
                            ? `${formatCalendarMonth(calendarMonth)} · 予定 ${calendarEvents.filter(isGuildWideCalendarEvent).length}件`
                          : nav === "expedition"
                            ? `遠征チケット ${resources.expeditionTickets}枚 · GOLD ${resources.gold}`
                          : nav === "stats"
                        ? "ギルドの戦況 · Realtime同期"
                        : `${quickFilter === "completed" ? sortedCompleted.length : sortedActive.length}件表示 · 操作中の冒険者 ${selectedPlayer || "未選択"}`}
                    </p>
                  </div>
                  <div className="hidden sm:flex flex-wrap items-center gap-2">
                    <div className="hidden xl:flex flex-wrap gap-2 text-[10px] sm:text-xs">
                      {openCount > 0 && (
                        <span className="pixel-chip px-2 py-1 border-[var(--color-gold)]/60 text-[var(--color-gold)] bg-[var(--color-gold)]/10">
                          未受注 {openCount}
                        </span>
                      )}
                      {recruitingCount > 0 && (
                        <span className="pixel-chip px-2 py-1 border-[var(--color-mana)]/60 text-[var(--color-mana)] bg-[var(--color-mana)]/10">
                          募集中 {recruitingCount}
                        </span>
                      )}
                      {helpWantedCount > 0 && (
                        <span className="pixel-chip px-2 py-1 border-[var(--color-rare)]/60 text-[var(--color-rare)] bg-[var(--color-rare)]/10">
                          助っ人募集 {helpWantedCount}
                        </span>
                      )}
                      {inProgressCount > 0 && (
                        <span className="pixel-chip px-2 py-1 border-amber-300/60 text-amber-200 bg-amber-400/10">
                          挑戦中 {inProgressCount}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        nav === "board"
                          ? setDirectQuestPost({ type: "open" })
                          : setTaskForm({ type: "create" })
                      }
                      disabled={boardDisabled}
                      className="quest-btn-primary hidden lg:inline-flex min-h-10 px-3 text-xs disabled:opacity-50"
                    >
                      {nav === "board" ? "直接依頼を掲示" : "任務を記す"}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {loading || tasksLoading ? (
              <LoadingBoard />
            ) : nav === "notebook" ? (
              <TaskNotebookPanel
                tasks={visibleTasks}
                selectedPlayer={selectedPlayer}
                ownPlayerName={ownPlayerName}
                canManageTasks={canManageSelectedTasks}
                dashboard={taskDashboard}
                calendarEventById={calendarEventById}
                questById={new Map(quests.map((quest) => [quest.id, quest]))}
                busy={busy || !isOnline}
                onEdit={(taskId) => setTaskForm({ type: "edit", taskId })}
                onOpenDetail={(taskId) =>
                  setTaskDetail({ type: "open", taskId })
                }
                onDelegate={handleDelegateTask}
                onComplete={handleCompleteTask}
                onOpenQuest={(questId) => setDetail({ type: "open", questId })}
                onOpenCalendar={(eventId) =>
                  setCalendarDetail({ type: "open", eventId })
                }
                onOpenNotices={() => navigateTo("notices")}
                onOpenRequestForm={(requestType, taskId) =>
                  setGuildRequestForm({ type: "open", requestType, taskId })
                }
                canIssueDirective={isGuildOfficer}
              />
            ) : nav === "notices" ? (
              <GuildNoticesPanel
                notices={relevantNotices}
                requests={receivedGuildRequests}
                events={calendarEvents}
                expeditions={expeditions}
                selectedPlayer={selectedPlayer}
                loading={guildOperationsLoading}
                busy={busy}
                onDismissNotice={handleDismissNotice}
                onAcceptRequest={handleAcceptGuildRequest}
                onRejectRequest={handleRejectGuildRequest}
              />
            ) : nav === "calendar" ? (
              <CalendarPanel
                events={calendarEvents}
                quests={quests}
                tasks={adventurerTasks}
                selectedPlayer={selectedPlayer}
                ownPlayerName={ownPlayerName}
                loading={calendarLoading}
                monthDate={calendarMonth}
                selectedDate={selectedCalendarDate}
                onMonthChange={setCalendarMonth}
                onSelectedDateChange={setSelectedCalendarDate}
                onCreate={(date) => setCalendarForm({ type: "create", date })}
                onCreateTask={(date) =>
                  setTaskForm({
                    type: "create",
                    defaults: {
                      dueDate: date,
                      calendarEventId: null,
                    },
                  })
                }
                onEdit={(eventId) => setCalendarForm({ type: "edit", eventId })}
                onOpenDetail={(eventId) =>
                  setCalendarDetail({ type: "open", eventId })
                }
                busy={busy}
              />
            ) : nav === "expedition" ? (
              <ExpeditionPanel
                selectedMember={selectedMember}
                resources={resources}
                expeditions={expeditions}
                currentExpedition={currentExpedition}
                loading={expeditionsLoading}
                now={now}
                busy={busy || !isOnline}
                onStart={handleStartExpedition}
                onClaim={handleClaimExpedition}
                onGrowthAction={handleGrowthAction}
              />
            ) : nav === "settings" ? (
              <SettingsScreen
                currentName={selectedPlayer}
                disabled={busy}
                onRename={handleRenamePlayer}
                onLogout={onLogout}
                onOpenGuide={() => setGuideOpen(true)}
              />
            ) : nav === "stats" ? (
              <GuildOverview
                activeCount={activeQuests.length}
                completedCount={completedHistory.length}
                openCount={openCount}
                guildProgress={guildProgress}
                noticeCount={relevantNotices.length}
                requestCount={receivedGuildRequests.length}
                completedLog={sortedCompleted}
                activityLogs={logs}
                logsLoading={logsLoading}
                onOpenNotices={() => navigateTo("notices")}
                onReopen={(id) => setReopen({ type: "open", questId: id })}
                onDeleteCompleted={(id) =>
                  setConfirm({ type: "delete", questId: id })
                }
                busy={busy}
              />
            ) : quickFilter === "completed" ? (
              <div className="flex min-h-0 flex-1 flex-col gap-2">
                <QuickFilters
                  active={quickFilter}
                  counts={filterCounts}
                  onChange={setQuickFilter}
                />
                <section className="rpg-frame min-h-0 flex-1 overflow-hidden p-3 sm:p-4 flex flex-col">
                  <header className="mb-3 shrink-0 pb-3 border-b border-[var(--color-gold)]/20">
                    <h3 className="pixel-window-title text-base font-semibold">
                      達成ログ
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      達成したクエストを確認できます。
                    </p>
                  </header>
                  <div className="min-h-0 overflow-y-auto custom-scroll">
                    <CompletedQuestLog
                      entries={sortedCompleted}
                      onReopen={(id) => setReopen({ type: "open", questId: id })}
                      onDelete={(id) => setConfirm({ type: "delete", questId: id })}
                    />
                  </div>
                </section>
              </div>
            ) : sortedActive.length === 0 ? (
              <div className="flex min-h-0 flex-1 flex-col gap-2">
                <QuickFilters
                  active={quickFilter}
                  counts={filterCounts}
                  onChange={setQuickFilter}
                />
                <div className="quest-list-scroll min-h-0 flex-1 overflow-y-auto custom-scroll pr-1">
                  <EmptyState
                    nav={nav}
                    filter={quickFilter}
                  />
                  {nav === "my" && quickFilter == null && (
                    <>
                      <MyTodayTasksPanel
                        tasks={ownTodayTasks}
                        onOpenNotebook={() => navigateTo("notebook")}
                      />
                      <ExpeditionPanel
                        selectedMember={selectedMember}
                        resources={resources}
                        expeditions={expeditions}
                        currentExpedition={currentExpedition}
                        loading={expeditionsLoading}
                        now={now}
                        busy={busy || !isOnline}
                        onStart={handleStartExpedition}
                        onClaim={handleClaimExpedition}
                        onGrowthAction={handleGrowthAction}
                        compact
                      />
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className={`flex min-h-0 flex-1 flex-col gap-2 ${busy ? "opacity-80 pointer-events-none" : ""}`}>
                <QuickFilters
                  active={quickFilter}
                  counts={filterCounts}
                  onChange={setQuickFilter}
                />
                <div className="quest-list-scroll min-h-0 flex-1 overflow-y-auto custom-scroll pr-1">
                  {nav === "board" && quickFilter == null && recommendedQuest && (
                    <RecommendedQuest
                      quest={recommendedQuest}
                      selectedPlayer={selectedPlayer}
                      staffByName={staffByName}
                      relatedEvent={
                        recommendedQuest.linkedEventId
                          ? calendarEventById.get(recommendedQuest.linkedEventId) ?? null
                          : null
                      }
                      linkedTask={taskByQuestId.get(recommendedQuest.id) ?? null}
                      busy={busy}
                      onAccept={handleAccept}
                      onBecomeSuccessor={handleBecomeSuccessor}
                      onRequestSuccession={handleRequestSuccession}
                      onRequestComplete={(id) =>
                        setConfirm({ type: "complete", questId: id })
                      }
                      onEdit={(id) => setModal({ type: "edit", questId: id })}
                      onRequestDelete={(id) =>
                        setConfirm({ type: "delete", questId: id })
                      }
                      onOpenDetail={(id) => setDetail({ type: "open", questId: id })}
                    />
                  )}
                  <div className="flex flex-col gap-2">
                    {sortedActive.map((quest, i) => (
                      <QuestCard
                        key={quest.id}
                        quest={quest}
                        index={i}
                        selectedPlayer={selectedPlayer}
                        staffByName={staffByName}
                        relatedEvent={
                          quest.linkedEventId
                            ? calendarEventById.get(quest.linkedEventId) ?? null
                            : null
                        }
                        linkedTask={taskByQuestId.get(quest.id) ?? null}
                        onAccept={handleAccept}
                        onBecomeSuccessor={handleBecomeSuccessor}
                        onRequestSuccession={handleRequestSuccession}
                        onRequestComplete={(id) =>
                          setConfirm({ type: "complete", questId: id })
                        }
                        onEdit={(id) => setModal({ type: "edit", questId: id })}
                        onRequestDelete={(id) =>
                          setConfirm({ type: "delete", questId: id })
                        }
                        onOpenDetail={(id) => setDetail({ type: "open", questId: id })}
                        disabled={busy || !isOnline}
                      />
                    ))}
                  </div>
                  {nav === "my" && quickFilter == null && (
                    <>
                      <MyTodayTasksPanel
                        tasks={ownTodayTasks}
                        onOpenNotebook={() => navigateTo("notebook")}
                      />
                      <ExpeditionPanel
                        selectedMember={selectedMember}
                        resources={resources}
                        expeditions={expeditions}
                        currentExpedition={currentExpedition}
                        loading={expeditionsLoading}
                        now={now}
                        busy={busy || !isOnline}
                        onStart={handleStartExpedition}
                        onClaim={handleClaimExpedition}
                        onGrowthAction={handleGrowthAction}
                        compact
                      />
                    </>
                  )}
                </div>
              </div>
            )}
          </main>

          <aside
            className={`lg:w-[17.5rem] xl:w-[19rem] shrink-0 min-h-0 mx-3 mb-3 lg:mx-0 lg:mb-0 flex-col gap-2 ${
              mobilePanel === "quests" ? "hidden lg:flex" : "flex"
            }`}
          >
            <PartyPanel
              staff={staff}
              loading={staffLoading}
              selectedPlayer={selectedPlayer}
              onSelectPlayer={setSelectedPlayer}
              className="w-full flex-[3] min-h-0"
            />
            <LatestBulletinPanel
              notices={relevantNotices}
              requests={receivedGuildRequests}
              events={calendarEvents}
              expeditions={expeditions}
              tasks={ownPlayerTasks}
              selectedPlayer={ownPlayerName || selectedPlayer}
              onOpenNotices={() => {
                navigateTo("notices");
                setMobilePanel("quests");
              }}
              onDismissNotice={handleDismissNotice}
              busy={busy}
              className="hidden lg:flex flex-[1.25] min-h-0"
            />
          </aside>
        </div>

        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 px-2 pb-[calc(env(safe-area-inset-bottom)+0.25rem)]">
          <div className="rpg-frame grid grid-cols-6 max-w-lg mx-auto bg-[var(--color-panel)]">
            {(
              [
                { id: "notebook" as NavId, icon: "📔", label: "手帳" },
                { id: "board" as NavId, icon: "📜", label: "依頼" },
                { id: "my" as NavId, icon: "⚔️", label: "自分" },
                { id: "calendar" as NavId, icon: "📅", label: "暦" },
                { id: "stats" as NavId, icon: "🏰", label: "ギルド" },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  navigateTo(item.id);
                  setQuickFilter(null);
                  setMobilePanel("quests");
                }}
                className={`min-h-12 flex flex-col items-center justify-center gap-0.5 py-1 text-[9px] font-semibold transition-colors font-[family-name:var(--font-pixel)] ${
                  nav === item.id && mobilePanel === "quests"
                    ? "nav-active"
                    : "text-slate-500"
                }`}
              >
                <span className="text-sm">{item.icon}</span>
                {item.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setMobilePanel("party")}
              className={`min-h-12 flex flex-col items-center justify-center gap-0.5 py-1 text-[9px] font-semibold border-l border-[var(--color-gold)]/15 transition-colors font-[family-name:var(--font-pixel)] ${
                mobilePanel === "party" ? "nav-active" : "text-slate-500"
              }`}
            >
              <span className="text-sm">👥</span>
              パーティ
            </button>
          </div>
        </nav>
      </div>

      <TaskFormModal
        open={taskForm.type !== "closed"}
        mode={taskForm.type === "edit" ? "edit" : "create"}
        initial={editingTask}
        defaults={taskForm.type === "create" ? taskForm.defaults : undefined}
        selectedPlayer={selectedPlayer}
        calendarEvents={calendarEvents}
        submitting={busy}
        onClose={() => setTaskForm({ type: "closed" })}
        onSubmit={handleSubmitTask}
      />

      <QuestFormModal
        open={modal.type !== "closed"}
        mode="edit"
        initial={editingQuest}
        staff={staff}
        selectedPlayer={selectedPlayer}
        calendarEvents={calendarEvents}
        onClose={() => setModal({ type: "closed" })}
        onSubmit={handleEditQuest}
        submitting={busy}
      />

      <TaskDetailModal
        task={detailTask}
        relatedEvent={
          detailTask?.calendarEventId
            ? calendarEventById.get(detailTask.calendarEventId) ?? null
            : null
        }
        relatedQuest={
          detailTask?.questId ? findQuest(detailTask.questId) ?? null : null
        }
        disabled={busy}
        onClose={() => setTaskDetail({ type: "closed" })}
        onEdit={(taskId) => {
          setTaskDetail({ type: "closed" });
          setTaskForm({ type: "edit", taskId });
        }}
        onDelete={handleDeleteTask}
        onDelegate={handleDelegateTask}
        onComplete={handleCompleteTask}
        onOpenQuest={(questId) => {
          setTaskDetail({ type: "closed" });
          setDetail({ type: "open", questId });
        }}
        onOpenEvent={(eventId) => {
          setTaskDetail({ type: "closed" });
          setCalendarDetail({ type: "open", eventId });
        }}
      />

      <QuestPublishModal
        open={questPublish.type === "open"}
        task={publishingTask}
        submitting={busy}
        onClose={() => setQuestPublish({ type: "closed" })}
        onSubmit={handlePublishQuest}
      />

      <DirectQuestPostModal
        open={directQuestPost.type === "open"}
        selectedPlayer={selectedPlayer}
        staff={staff}
        calendarEvents={calendarEvents}
        submitting={busy}
        onClose={() => setDirectQuestPost({ type: "closed" })}
        onSubmit={handleDirectQuestPost}
      />

      <GuildRequestFormModal
        open={guildRequestForm.type === "open"}
        requestType={
          guildRequestForm.type === "open"
            ? guildRequestForm.requestType
            : "suggestion"
        }
        sourceTask={guildRequestSourceTask}
        staff={staff}
        selectedPlayer={selectedPlayer}
        calendarEvents={calendarEvents}
        canIssueDirective={isGuildOfficer}
        submitting={busy}
        onClose={() => setGuildRequestForm({ type: "closed" })}
        onSubmit={handleSubmitGuildRequest}
      />

      <EmergencyReportModal
        open={urgentReport.shouldShow}
        overdueCount={urgentReport.overdue.length}
        dueSoonCount={urgentReport.dueSoon.length}
        onClose={() => setUrgentReportSeen(true)}
        onOpenNotices={() => {
          setUrgentReportSeen(true);
          navigateTo("notices");
          setMobilePanel("quests");
        }}
      />

      <CalendarEventFormModal
        open={calendarForm.type !== "closed"}
        mode={calendarForm.type === "edit" ? "edit" : "create"}
        initial={editingCalendarEvent}
        initialDate={
          calendarForm.type === "create"
            ? calendarForm.date ?? selectedCalendarDate
            : editingCalendarEvent?.eventDate ?? selectedCalendarDate
        }
        staff={staff}
        quests={quests}
        submitting={busy}
        onClose={() => setCalendarForm({ type: "closed" })}
        onSubmit={handleSubmitCalendarEvent}
      />

      <CalendarEventDetailModal
        event={detailCalendarEvent}
        relatedTasks={
          detailCalendarEvent
            ? getRelatedTasksForEvent(
                detailCalendarEvent,
                filterVisibleCalendarTasks(
                  adventurerTasks,
                  selectedPlayer || ownPlayerName,
                  ownPlayerName,
                ),
              )
            : []
        }
        relatedQuests={
          detailCalendarEvent
            ? getRelatedQuestsForEvent(detailCalendarEvent, quests)
            : []
        }
        disabled={busy}
        onClose={() => setCalendarDetail({ type: "closed" })}
        onEdit={(eventId) => setCalendarForm({ type: "edit", eventId })}
        onDelete={handleDeleteCalendarEvent}
        onCreateTask={(event) => {
          setCalendarDetail({ type: "closed" });
          setTaskForm({
            type: "create",
            defaults: {
              title: event.title,
              description: event.description,
              dueDate: event.eventDate,
              calendarEventId: event.id,
              importance: event.importance,
            },
          });
        }}
      />

      <ConfirmModal
        open={confirm.type === "complete"}
        title="討伐完了にしますか？"
        message={
          confirmQuest
            ? `「${confirmQuest.title}」を達成ログへ移動します。`
            : ""
        }
        confirmLabel="討伐完了"
        variant="gold"
        onConfirm={executeComplete}
        onCancel={() => setConfirm({ type: "closed" })}
        disabled={busy}
      />

      <ConfirmModal
        open={confirm.type === "delete"}
        title="クエストを削除しますか？"
        message={
          confirmQuest
            ? `「${confirmQuest.title}」をギルド記録から削除します。この操作は取り消せません。`
            : ""
        }
        confirmLabel="削除"
        variant="danger"
        onConfirm={executeDelete}
        onCancel={() => setConfirm({ type: "closed" })}
        disabled={busy}
      />

      <ReopenQuestModal
        open={reopen.type === "open"}
        quest={reopenQuestData}
        onClose={() => setReopen({ type: "closed" })}
        onConfirm={executeReopen}
        disabled={busy}
      />

      <QuestDetailModal
        quest={detailQuest}
        staffByName={staffByName}
        relatedEvent={
          detailQuest?.linkedEventId
            ? calendarEventById.get(detailQuest.linkedEventId) ?? null
            : null
        }
        open={detail.type === "open" && detailQuest != null}
        onClose={() => setDetail({ type: "closed" })}
        onOpenEvent={(eventId) => {
          setDetail({ type: "closed" });
          setCalendarDetail({ type: "open", eventId });
        }}
        onEdit={(id) => {
          setDetail({ type: "closed" });
          setModal({ type: "edit", questId: id });
        }}
        onDelete={(id) => {
          setDetail({ type: "closed" });
          setConfirm({ type: "delete", questId: id });
        }}
        disabled={busy}
      />

      <SettingsModal
        open={settingsOpen}
        currentName={selectedPlayer}
        disabled={busy}
        onClose={() => setSettingsOpen(false)}
        onRename={handleRenamePlayer}
        onOpenGuide={() => setGuideOpen(true)}
        onLogout={() => {
          setSettingsOpen(false);
          onLogout();
        }}
      />

      <ToastStack toasts={toasts} />
      <RPGMessageWindow message={activeMessage} onDismiss={dismissMessage} />
      {completionBurst && <CompletionBurst reward={completionBurst} />}
      <GuideModal open={guideOpen} onClose={closeGuide} />
    </div>
  );
}

function GameHud({
  selectedMember,
  selectedPlayer,
  guildProgress,
}: {
  selectedMember: PartyMember | null;
  selectedPlayer: string;
  guildProgress: {
    completedCount: number;
    exp: number;
    rankProgress: number;
  };
}) {
  return (
    <div className="game-hud hidden lg:grid grid-cols-[minmax(15rem,0.85fr)_minmax(20rem,1.25fr)_minmax(16rem,0.95fr)] gap-2 px-2 pt-2">
      <section className="rpg-frame hud-title-panel px-3 py-2 flex items-center gap-2.5">
        <div className="guild-crest" aria-hidden>
          ⚔
        </div>
        <div>
          <h1 className="pixel-title text-xl font-bold gold-text">
            ギルドクエスト
          </h1>
          <p className="pixel-title text-[10px] text-[var(--color-gold-bright)] tracking-widest">
            ++ GUILD QUEST ++
          </p>
        </div>
      </section>

      <SelectedPlayerPanel
        selectedMember={selectedMember}
        selectedPlayer={selectedPlayer}
      />

      <section className="rpg-frame px-3 py-2">
        <div className="flex items-center gap-2.5">
          <div className="slime-orb" aria-hidden>
            ◆
          </div>
          <div className="min-w-0 flex-1">
            <p className="pixel-title text-xs text-slate-300">
              ギルドランク {GUILD_STATS.guildRank}
            </p>
            <p className="mt-0.5 text-xs text-[var(--color-gold-bright)]">
              ギルドは平穏です
            </p>
            <HudMeter
              label={`今日 ${guildProgress.completedCount}件 / ${guildProgress.exp} EXP`}
              value={guildProgress.rankProgress}
              tone="gold"
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function SelectedPlayerPanel({
  selectedMember,
  selectedPlayer,
}: {
  selectedMember: PartyMember | null;
  selectedPlayer: string;
}) {
  const expProgress = selectedMember ? selectedMember.exp % 100 : 0;
  const frame = selectedMember?.avatarFrame ?? "bronze";

  return (
    <section className="rpg-frame selected-player-panel px-3 py-1.5">
      <p className="pixel-title text-[10px] text-[var(--color-gold-bright)]">
        操作中の冒険者
      </p>
      <div className="mt-1 flex items-center gap-2">
        <AvatarSprite
          avatarType={selectedMember?.avatarType}
          fallback={selectedMember?.avatar ?? "⚔️"}
          alt={selectedMember?.name ?? selectedPlayer ?? "冒険者"}
          frame={frame}
          size="lg"
          className="hud-avatar"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="pixel-title text-base text-slate-50 truncate">
              {selectedMember?.name ?? selectedPlayer ?? "未選択"}
            </p>
            <p className="pixel-title text-sm text-slate-50">
              Lv.{selectedMember?.level ?? "--"}
            </p>
          </div>
          <p className="text-[10px] text-[var(--color-gold)] truncate">
            {selectedMember
              ? `${selectedMember.title} / ${selectedMember.role}`
              : "冒険者を選択してください"}
          </p>
          <HudMeter
            label={`EXP ${selectedMember?.exp ?? 0}`}
            value={expProgress}
            tone="xp"
          />
        </div>
      </div>
    </section>
  );
}

function HudMeter({
  label,
  value,
  tone,
  compact = false,
}: {
  label: string;
  value: number;
  tone: "gold" | "xp" | "hp" | "mp";
  compact?: boolean;
}) {
  const color =
    tone === "xp"
      ? "bg-[var(--color-xp)]"
      : tone === "hp"
        ? "bg-[var(--color-hp)]"
        : tone === "mp"
          ? "bg-[var(--color-mana)]"
          : "bg-[var(--color-gold-bright)]";

  return (
    <div className={compact ? "mt-1" : "mt-1.5"}>
      <div className="flex justify-between text-[9px] text-slate-400">
        <span>{label}</span>
        <span>{Math.round(value)}%</span>
      </div>
      <div className={compact ? "hud-meter h-1.5" : "hud-meter h-2"}>
        <div className={`h-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

type LatestBulletin = {
  id: string;
  tone: "alert" | "news" | "schedule" | "expedition";
  label: string;
  title: string;
  message: string;
  meta?: string;
  noticeId?: number;
};

function LatestBulletinPanel({
  notices,
  requests,
  events,
  expeditions,
  tasks,
  selectedPlayer,
  onOpenNotices,
  onDismissNotice,
  busy,
  className = "",
}: {
  notices: GuildNotice[];
  requests: GuildRequest[];
  events: CalendarEvent[];
  expeditions: Expedition[];
  tasks: AdventurerTask[];
  selectedPlayer: string;
  onOpenNotices: () => void;
  onDismissNotice: (noticeId: number) => void;
  busy: boolean;
  className?: string;
}) {
  const items = buildLatestBulletins({
    notices,
    requests,
    events,
    expeditions,
    tasks,
    selectedPlayer,
  }).slice(0, 2);

  return (
    <section className={`rpg-frame latest-bulletin-panel p-2.5 flex-col ${className}`}>
      <header className="mb-1.5 flex items-center justify-between border-b-2 border-[var(--color-gold)]/25 pb-1.5">
        <h2 className="pixel-window-title text-sm font-bold">最新速報</h2>
        <span className="pixel-chip px-2 py-1 text-[10px] text-slate-400">
          ALERT
        </span>
      </header>
      {items.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center text-center">
          <p className="text-xs leading-5 text-slate-500">
            重要なお知らせはありません。
          </p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto custom-scroll space-y-2 pr-1">
          {items.map((item, index) => (
            <article
              key={item.id}
              className={`latest-bulletin-card latest-bulletin-${item.tone} ${index === 0 ? "is-primary" : ""} p-2.5`}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="calendar-tag">{item.label}</span>
                {item.meta && (
                  <span className="truncate text-[9px] text-slate-500">
                    {item.meta}
                  </span>
                )}
              </div>
              <h3 className="pixel-title line-clamp-2 text-sm text-slate-100">
                {item.title}
              </h3>
              <p className="mt-1 line-clamp-3 text-[11px] leading-5 text-slate-400">
                {item.message}
              </p>
              <div className={`mt-2 grid gap-1 ${item.noticeId ? "grid-cols-2" : "grid-cols-1"}`}>
                <button
                  type="button"
                  onClick={onOpenNotices}
                  className="quest-btn-ghost min-h-9 px-2 text-[10px]"
                >
                  詳細
                </button>
                {item.noticeId && (
                  <button
                    type="button"
                    onClick={() => onDismissNotice(item.noticeId!)}
                    disabled={busy}
                    className="quest-btn-ghost min-h-9 px-2 text-[10px] disabled:opacity-45"
                  >
                    確認済み
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function buildLatestBulletins({
  notices,
  requests,
  events,
  expeditions,
  tasks,
  selectedPlayer,
}: {
  notices: GuildNotice[];
  requests: GuildRequest[];
  events: CalendarEvent[];
  expeditions: Expedition[];
  tasks: AdventurerTask[];
  selectedPlayer: string;
}): LatestBulletin[] {
  const today = toDateInputValue(new Date());
  const weekRange = getWeekRange(new Date());
  const taskAlerts = tasks
    .filter((task) => task.status !== "completed")
    .map((task): LatestBulletin | null => {
      const level = getDeadlineWarningLevel(task);
      if (!level) return null;
      return {
        id: `task-${task.id}`,
        tone: "alert",
        label: level === "overdue" ? "ギルド警報" : "納期警告",
        title: `「${task.title}」の納期${level === "overdue" ? "を過ぎています" : "が近づいています"}`,
        message:
          level === "overdue"
            ? `${task.ownerName}の任務が未完了です。`
            : `${task.ownerName}の任務です。早めに確認してください。`,
        meta: task.dueDate ?? undefined,
      };
    })
    .filter((item): item is LatestBulletin => item != null);

  const noticeItems = notices.map((notice): LatestBulletin => ({
    id: `notice-${notice.id}`,
    tone:
      notice.type === "deadline_warning" || notice.type === "overdue"
        ? "alert"
        : "news",
    label:
      notice.type === "deadline_warning" || notice.type === "overdue"
        ? "ギルド警報"
        : "ギルド速報",
    title: notice.title,
    message: notice.message,
    meta: "通知",
    noticeId: notice.id,
  }));

  const requestItems = requests.map((request): LatestBulletin => ({
    id: `request-${request.id}`,
    tone: request.requestType === "directive" ? "alert" : "news",
    label:
      request.requestType === "directive"
        ? "ギルド警報"
        : request.requestType === "suggestion"
          ? "助言"
          : "指名依頼",
    title: request.taskTitle,
    message: `${request.fromPlayer || "ギルド"}から${REQUEST_TYPE_LABELS[request.requestType]}が届いています。`,
    meta: "受信依頼",
  }));

  const eventItems = events
    .filter(
      (event) =>
        isGuildWideCalendarEvent(event) &&
        event.importance >= 4 &&
        event.eventDate >= today &&
        isDateWithinRange(event.eventDate, weekRange.start, weekRange.end),
    )
    .sort(compareCalendarEvents)
    .slice(0, 3)
    .map((event): LatestBulletin => ({
      id: `event-${event.id}`,
      tone: "schedule",
      label: "ギルド予定",
      title: event.title,
      message: `${formatCalendarDate(event.eventDate)} ${formatEventTime(event)}`,
      meta: formatCalendarDate(event.eventDate),
    }));

  const expeditionItems = expeditions
    .filter(
      (expedition) =>
        expedition.status === "completed" &&
        isExpeditionReady(expedition, Date.now()),
    )
    .map((expedition): LatestBulletin => ({
      id: `expedition-${expedition.id}`,
      tone: "expedition",
      label: "遠征帰還",
      title: expedition.expeditionName,
      message: `${selectedPlayer}が遠征から帰還しました。報酬を受け取れます。`,
      meta: "報酬あり",
    }));

  return [
    ...taskAlerts,
    ...noticeItems,
    ...requestItems,
    ...eventItems,
    ...expeditionItems,
  ];
}

function SettingsScreen({
  currentName,
  disabled,
  onRename,
  onLogout,
  onOpenGuide,
}: {
  currentName: string;
  disabled: boolean;
  onRename: (name: string) => Promise<void>;
  onLogout: () => void;
  onOpenGuide: () => void;
}) {
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setName(currentName);
    setError(null);
    setSubmitting(false);
  }, [currentName]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextName = name.trim();
    if (!nextName) {
      setError("冒険者名を入力してください");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onRename(nextName);
    } catch {
      setError("冒険者名の変更に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="rpg-frame min-h-0 flex-1 overflow-y-auto custom-scroll p-3 sm:p-4">
      <header className="border-b-2 border-[var(--color-gold)]/25 pb-3">
        <p className="font-[family-name:var(--font-display)] text-[10px] tracking-[0.24em] text-[var(--color-gold)]/80">
          SYSTEM
        </p>
        <h3 className="pixel-window-title mt-1 text-base font-semibold">
          設定
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          操作中の冒険者: {currentName || "未選択"}
        </p>
      </header>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <form
          onSubmit={handleSubmit}
          className="border-2 border-white/15 bg-black/20 p-3 shadow-[3px_3px_0_#000]"
        >
          <label className="block">
            <span className="block text-xs font-bold text-[var(--color-gold)] tracking-widest mb-2">
              冒険者名を変更
            </span>
            <input
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (error) setError(null);
              }}
              disabled={disabled || submitting}
              maxLength={24}
              className="quest-input"
              placeholder="例：リオ"
            />
          </label>
          {error && (
            <p className="mt-3 border-2 border-red-400/55 bg-red-500/10 px-3 py-2 text-sm text-red-200 shadow-[3px_3px_0_#000]">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={disabled || submitting}
            className="quest-btn-primary mt-3 w-full disabled:opacity-50"
          >
            名前を変更
          </button>
        </form>

        <div className="border-2 border-white/15 bg-black/20 p-3 shadow-[3px_3px_0_#000]">
          <h4 className="pixel-title text-sm text-[var(--color-gold-bright)]">
            ギルド操作
          </h4>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            退出しても冒険者は名簿から削除されません。次回は合言葉と冒険者名で再入場できます。
          </p>
          <div className="mt-4 grid gap-2">
            <button
              type="button"
              onClick={onOpenGuide}
              disabled={disabled || submitting}
              className="quest-btn-ghost w-full disabled:opacity-50"
            >
              初回ガイドを見る
            </button>
            <button
              type="button"
              onClick={onLogout}
              disabled={disabled || submitting}
              className="quest-btn-ghost w-full border-red-400/70 text-red-200 disabled:opacity-50"
            >
              ギルドから退出
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function QuestDetailModal({
  quest,
  staffByName,
  relatedEvent,
  open,
  onClose,
  onOpenEvent,
  onEdit,
  onDelete,
  disabled,
}: {
  quest: Quest | null;
  staffByName: ReadonlyMap<string, PartyMember>;
  relatedEvent: CalendarEvent | null;
  open: boolean;
  onClose: () => void;
  onOpenEvent: (eventId: number) => void;
  onEdit: (questId: number) => void;
  onDelete: (questId: number) => void;
  disabled: boolean;
}) {
  if (!open || !quest) return null;

  const rank = quest.urgency * quest.importance;
  const statusLabel =
    quest.status === "open"
      ? "未受注"
      : quest.status === "recruiting"
        ? "募集中"
      : quest.status === "in_progress"
        ? "挑戦中"
        : quest.status === "help_wanted"
          ? "助っ人募集"
          : "達成済み";

  return (
    <div
      className="fixed inset-0 z-[65] flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quest-detail-title"
    >
      <button
        type="button"
        className="modal-backdrop absolute inset-0 bg-black/80"
        aria-label="詳細を閉じる"
        onClick={disabled ? undefined : onClose}
      />
      <section className="modal-panel relative rpg-frame w-full max-w-2xl max-h-[92dvh] overflow-y-auto custom-scroll p-4 sm:p-5">
        <header className="border-b-2 border-[var(--color-gold)]/30 pb-3">
          <p className="pixel-title text-xs text-[var(--color-gold)]">
            REQUEST DETAIL
          </p>
          <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2
                id="quest-detail-title"
                className="pixel-window-title text-xl sm:text-2xl font-bold"
              >
                {quest.title}
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                依頼者: {quest.requester} / 推定時間: {quest.estimatedTime} / 納期: {formatDueAt(quest.dueAt)}
              </p>
            </div>
            <div className="pixel-chip px-3 py-2 text-center text-[var(--color-gold-bright)]">
              <p className="text-[10px]">依頼ランク</p>
              <p className="text-2xl leading-none">{rank}</p>
              <p className="text-[10px]">
                ({quest.urgency}×{quest.importance})
              </p>
            </div>
          </div>
        </header>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <DetailCell label="状態" value={statusLabel} />
          <DetailCell label="Lv" value={QUEST_DIFFICULTY_LABELS[quest.difficulty]} />
          <DetailCell label="必要人員" value={`${quest.requiredMembers}人`} />
          <DetailCell label="参加人数" value={`${quest.participants.length}/${quest.requiredMembers}`} />
          <DetailCell label="納期" value={formatDueAt(quest.dueAt)} />
          <DetailCell label="緊急度" value={`◆`.repeat(quest.urgency)} />
          <DetailCell label="重要度" value={`◆`.repeat(quest.importance)} />
          {quest.participants.length === 0 ? (
            <DetailCell label="参加メンバー" value="—" />
          ) : (
            quest.participants.map((participant, index) => (
              <DetailCell
                key={participant}
                label={`参加メンバー${index + 1}`}
                value={participant}
                member={staffByName.get(participant)}
              />
            ))
          )}
        </div>

        <section className="mt-4 border-2 border-white/15 bg-black/20 p-3 shadow-[3px_3px_0_#000]">
          <h3 className="pixel-title text-sm text-[var(--color-gold-bright)]">
            依頼内容
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            {quest.description || "説明はありません。"}
          </p>
        </section>

        {relatedEvent && (
          <section className="mt-4 border-2 border-[var(--color-gold)]/35 bg-black/20 p-3 shadow-[3px_3px_0_#000]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="pixel-title text-sm text-[var(--color-gold-bright)]">
                  関連予定
                </h3>
                <p className="mt-2 text-sm text-slate-300">
                  {relatedEvent.title}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {formatCalendarDate(relatedEvent.eventDate)} / {formatEventTime(relatedEvent)} / {EVENT_TYPE_LABELS[relatedEvent.eventType]} / 重要度{relatedEvent.importance}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onOpenEvent(relatedEvent.id)}
                disabled={disabled}
                className="quest-btn-ghost min-h-11 px-3 text-xs disabled:opacity-45"
              >
                予定詳細
              </button>
            </div>
          </section>
        )}

        <footer className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={onClose}
            disabled={disabled}
            className="quest-btn-secondary disabled:opacity-45"
          >
            戻る
          </button>
          <button
            type="button"
            onClick={() => onEdit(quest.id)}
            disabled={disabled}
            className="quest-btn-ghost disabled:opacity-45"
          >
            編集
          </button>
          <button
            type="button"
            onClick={() => onDelete(quest.id)}
            disabled={disabled}
            className="quest-btn-ghost border-red-400/70 text-red-200 disabled:opacity-45"
          >
            削除
          </button>
        </footer>
      </section>
    </div>
  );
}

function DetailCell({
  label,
  value,
  member,
}: {
  label: string;
  value: string;
  member?: PartyMember;
}) {
  const empty = value === "—";

  return (
    <div className="border-2 border-white/15 bg-black/20 p-3 shadow-[2px_2px_0_#000]">
      <p className="text-[10px] text-[var(--color-gold)]">{label}</p>
      {member ? (
        <div className="mt-1 flex items-center gap-2">
          <AvatarSprite
            avatarType={member.avatarType}
            fallback={member.avatar}
            alt={member.name}
            size="xs"
          />
          <p className="min-w-0 truncate text-sm text-slate-100">{value}</p>
        </div>
      ) : (
        <p className={empty ? "mt-1 text-sm text-slate-500" : "mt-1 text-sm text-slate-100"}>
          {value}
        </p>
      )}
    </div>
  );
}

function formatDueAt(value: string | null | undefined) {
  if (!value) return "未設定";
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

function MyTodayTasksPanel({
  tasks,
  onOpenNotebook,
}: {
  tasks: AdventurerTask[];
  onOpenNotebook: () => void;
}) {
  return (
    <section className="rpg-frame mt-2 p-2.5">
      <header className="mb-2 flex items-center justify-between gap-2 border-b border-[var(--color-gold)]/20 pb-2">
        <div className="min-w-0">
          <h3 className="pixel-window-title text-sm font-semibold">
            今日の任務
          </h3>
          <p className="mt-0.5 text-[10px] text-slate-500">
            手帳の本日分 · {tasks.length}件
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenNotebook}
          className="quest-btn-ghost min-h-10 shrink-0 px-2.5 text-[10px]"
        >
          手帳へ
        </button>
      </header>
      {tasks.length === 0 ? (
        <p className="py-2 text-xs text-slate-500">本日の任務はありません。</p>
      ) : (
        <div className="grid gap-1.5">
          {tasks.slice(0, 3).map((task) => (
            <button
              type="button"
              key={task.id}
              onClick={onOpenNotebook}
              className="my-task-mini-card text-left"
            >
              <span className={`task-status-badge task-status-${task.status}`}>
                {TASK_STATUS_LABELS[task.status]}
              </span>
              <span className="min-w-0 truncate text-xs text-slate-100">
                {task.title}
              </span>
              <span className="calendar-tag shrink-0">{getTaskDueLabel(task)}</span>
            </button>
          ))}
          {tasks.length > 3 && (
            <button
              type="button"
              onClick={onOpenNotebook}
              className="text-left text-[11px] text-[var(--color-gold-bright)]"
            >
              ほか {tasks.length - 3}件を手帳で見る
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function TaskNotebookPanel({
  tasks,
  selectedPlayer,
  ownPlayerName,
  canManageTasks,
  dashboard,
  calendarEventById,
  questById,
  busy,
  onEdit,
  onOpenDetail,
  onDelegate,
  onComplete,
  onOpenQuest,
  onOpenCalendar,
  onOpenNotices,
  onOpenRequestForm,
  canIssueDirective: canUseDirective,
}: {
  tasks: AdventurerTask[];
  selectedPlayer: string;
  ownPlayerName: string;
  canManageTasks: boolean;
  dashboard: {
    today: number;
    dueSoon: number;
    delegated: number;
    receivedRequests: number;
    receivedSuggestions: number;
    directives: number;
    expeditionReturns: number;
    unclaimedRewards: number;
  };
  calendarEventById: ReadonlyMap<number, CalendarEvent>;
  questById: ReadonlyMap<number, Quest>;
  busy: boolean;
  onEdit: (taskId: number) => void;
  onOpenDetail: (taskId: number) => void;
  onDelegate: (taskId: number) => void;
  onComplete: (taskId: number) => void;
  onOpenQuest: (questId: number) => void;
  onOpenCalendar: (eventId: number) => void;
  onOpenNotices: () => void;
  onOpenRequestForm: (requestType: GuildRequestType, taskId: number) => void;
  canIssueDirective: boolean;
}) {
  const [tab, setTab] = useState<AdventurerTaskTab>("today");
  const activeTasks = useMemo(
    () => tasks.filter((task) => task.status !== "completed"),
    [tasks],
  );
  const taskCounts = useMemo(() => {
    return {
      today: filterTasksByTab(activeTasks, "today").length,
      week: filterTasksByTab(activeTasks, "week").length,
      month: filterTasksByTab(activeTasks, "month").length,
      future: filterTasksByTab(activeTasks, "future").length,
    };
  }, [activeTasks]);
  const visibleTasks = useMemo(
    () => sortAdventurerTasks(filterTasksByTab(activeTasks, tab)),
    [activeTasks, tab],
  );

  const stats = [
    { label: "本日の任務", value: dashboard.today, tone: "gold" },
    { label: "期限間近", value: dashboard.dueSoon, tone: "red" },
    { label: "依頼中", value: dashboard.delegated, tone: "purple" },
    { label: "受信依頼", value: dashboard.receivedRequests, tone: "blue" },
    { label: "受信助言", value: dashboard.receivedSuggestions, tone: "green" },
    { label: "ギルド指令", value: dashboard.directives, tone: "red" },
    { label: "遠征帰還", value: dashboard.expeditionReturns, tone: "blue" },
    { label: "未受領報酬", value: dashboard.unclaimedRewards, tone: "green" },
  ];
  const mobileStats = stats.filter((stat) =>
    ["本日の任務", "期限間近", "依頼中", "受信依頼", "ギルド指令"].includes(
      stat.label,
    ),
  );

  return (
    <section className="notebook-panel min-h-0 flex-1 overflow-hidden flex flex-col gap-2">
      <div className="rpg-frame notebook-cover p-2.5 sm:p-3 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-[family-name:var(--font-display)] text-[10px] tracking-[0.22em] text-[var(--color-gold)]/80">
              ADVENTURER NOTEBOOK
            </p>
            <h3 className="pixel-window-title mt-1 text-base sm:text-lg font-semibold">
              {canManageTasks
                ? "自分の本日の任務"
                : `${selectedPlayer || "冒険者"}の公開任務`}
            </h3>
            <p className="mt-1 text-xs text-slate-500 truncate">
              {canManageTasks
                ? `${ownPlayerName || "自分"} の手帳から、必要な任務だけをギルド依頼にします。`
                : "公開されている任務だけを表示しています。非公開任務は本人以外には見えません。"}
            </p>
          </div>
        </div>

        <div className="mt-2 -mx-2 flex gap-1.5 overflow-x-auto custom-scroll px-2 lg:hidden">
          {mobileStats.map((stat) => (
            <button
              type="button"
              key={stat.label}
              onClick={
                stat.label === "受信依頼" || stat.label === "ギルド指令"
                  ? onOpenNotices
                  : undefined
              }
              className={`notebook-stat-chip notebook-stat-${stat.tone}`}
            >
              <span>{stat.label.replace("本日の任務", "本日")}</span>
              <strong>{stat.value}</strong>
            </button>
          ))}
        </div>

        <div className="mt-3 hidden grid-cols-2 gap-1.5 lg:grid xl:grid-cols-4">
          {stats.map((stat) => (
            <button
              type="button"
              key={stat.label}
              onClick={
                stat.label === "受信依頼" ||
                stat.label === "受信助言" ||
                stat.label === "ギルド指令"
                  ? onOpenNotices
                  : undefined
              }
              className={`notebook-stat notebook-stat-${stat.tone} border-2 bg-black/25 px-2 py-2 text-center shadow-[2px_2px_0_#000]`}
            >
              <p className="text-[9px] text-slate-500 truncate">{stat.label}</p>
              <p className="pixel-title mt-1 text-base text-[var(--color-gold-bright)]">
                {stat.value}
              </p>
            </button>
          ))}
        </div>
      </div>

      <div className="quick-filter-bar shrink-0 -mx-3 lg:-mx-0 px-3 lg:px-0 py-1 bg-[#17101a] border-y-2 border-[#fff4c4]/35">
        <div className="flex gap-1.5 overflow-x-auto custom-scroll" role="tablist" aria-label="手帳タブ">
          {(Object.keys(TASK_TAB_LABELS) as AdventurerTaskTab[]).map((item) => {
            const selected = tab === item;
            return (
              <button
                key={item}
                type="button"
                onClick={() => setTab(item)}
                aria-pressed={selected}
                className={`pixel-chip min-h-10 shrink-0 px-2 text-[10px] font-semibold transition-all ${
                  selected
                    ? "bg-[var(--color-gold-bright)] text-[#17101a]"
                    : "bg-black/80 text-slate-300 hover:text-[var(--color-gold-bright)]"
                }`}
              >
                {TASK_TAB_LABELS[item]}
                <span className="ml-1.5 text-[10px] text-slate-400">
                  {taskCounts[item]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className={`notebook-task-list min-h-0 flex-1 overflow-y-auto custom-scroll pr-1 pb-20 lg:pb-1 ${busy ? "opacity-80 pointer-events-none" : ""}`}>
        {visibleTasks.length === 0 ? (
          <div className="rpg-frame p-5 text-center">
            <p className="text-3xl">📔</p>
            <h4 className="pixel-window-title mt-3 text-base font-semibold">
              {canManageTasks
                ? "本日の任務はありません"
                : "公開されている任務はありません"}
            </h4>
            <p className="mt-2 text-sm text-slate-500">
              {canManageTasks
                ? "この期間の任務はありません。必要な作業は右上の「任務を記す」から登録できます。"
                : "この冒険者の非公開任務は表示されません。"}
            </p>
          </div>
        ) : (
          <div className="grid gap-2">
            {visibleTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                relatedEvent={
                  task.calendarEventId
                    ? calendarEventById.get(task.calendarEventId) ?? null
                    : null
                }
                relatedQuest={task.questId ? questById.get(task.questId) ?? null : null}
                busy={busy}
                canManage={canManageTasks}
                onEdit={onEdit}
                onOpenDetail={onOpenDetail}
                onDelegate={onDelegate}
                onComplete={onComplete}
                onOpenQuest={onOpenQuest}
                onOpenCalendar={onOpenCalendar}
                onOpenRequestForm={onOpenRequestForm}
                canIssueDirective={canUseDirective}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function TaskCard({
  task,
  relatedEvent,
  relatedQuest,
  busy,
  canManage,
  onEdit,
  onOpenDetail,
  onDelegate,
  onComplete,
  onOpenQuest,
  onOpenCalendar,
  onOpenRequestForm,
  canIssueDirective: canUseDirective,
}: {
  task: AdventurerTask;
  relatedEvent: CalendarEvent | null;
  relatedQuest: Quest | null;
  busy: boolean;
  canManage: boolean;
  onEdit: (taskId: number) => void;
  onOpenDetail: (taskId: number) => void;
  onDelegate: (taskId: number) => void;
  onComplete: (taskId: number) => void;
  onOpenQuest: (questId: number) => void;
  onOpenCalendar: (eventId: number) => void;
  onOpenRequestForm: (requestType: GuildRequestType, taskId: number) => void;
  canIssueDirective: boolean;
}) {
  const score = getTaskScore(task);
  const dueTone = getTaskDueTone(task);
  const disabled = busy || task.status === "completed";

  return (
    <article className={`task-note-card task-due-${dueTone} p-2.5 sm:p-3`}>
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_14rem] lg:items-center">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <span className={`task-status-badge task-status-${task.status}`}>
              {TASK_STATUS_LABELS[task.status]}
            </span>
            <span className="calendar-tag">依頼ランク {score}</span>
            <span className={`calendar-tag ${dueTone === "overdue" || dueTone === "today" ? "is-danger" : ""}`}>
              {getTaskDueLabel(task)}
            </span>
            {task.isPublic && <span className="calendar-tag">公開</span>}
            {relatedEvent && (
              <button
                type="button"
                onClick={() => onOpenCalendar(relatedEvent.id)}
                className="calendar-tag hover:text-[var(--color-gold-bright)]"
              >
                📅 関連予定
              </button>
            )}
          </div>
          <h4 className="pixel-title truncate text-base text-slate-100">
            {task.title}
          </h4>
          <p className="mt-1 text-[11px] text-slate-500">
            持ち主: {task.ownerName} / 緊急 {renderScoreGems(task.priority)} / 重要 {renderScoreGems(task.importance)}
          </p>
          {task.description && (
            <p className="mt-1 line-clamp-1 text-xs text-slate-400">
              {task.description}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-1">
          {task.status === "delegated" && relatedQuest ? (
            <button
              type="button"
              onClick={() => onOpenQuest(relatedQuest.id)}
              disabled={busy}
              className="quest-btn-primary min-h-11 text-xs disabled:opacity-45"
            >
              依頼を見る
            </button>
          ) : task.status === "completed" ? (
            <button
              type="button"
              disabled
              className="quest-btn-secondary min-h-11 text-xs opacity-50"
            >
              達成済み
            </button>
          ) : canManage ? (
            <button
              type="button"
              onClick={() => onComplete(task.id)}
              disabled={disabled}
              className="quest-btn-primary min-h-11 text-xs disabled:opacity-45"
            >
              任務完了
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onOpenDetail(task.id)}
              disabled={busy}
              className="quest-btn-ghost min-h-11 text-xs disabled:opacity-45"
            >
              詳細
            </button>
          )}
          {canManage && task.status !== "completed" && task.status !== "delegated" ? (
            <button
              type="button"
              onClick={() => onDelegate(task.id)}
              disabled={busy}
              className="quest-btn-ghost min-h-11 text-xs disabled:opacity-45"
            >
              任務を依頼書化
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onOpenDetail(task.id)}
              disabled={busy}
              className="quest-btn-ghost min-h-11 text-xs disabled:opacity-45"
            >
              詳細
            </button>
          )}
          {canManage && task.status !== "completed" && (
            <button
              type="button"
              onClick={() => onOpenRequestForm("suggestion", task.id)}
              disabled={busy}
              className="quest-btn-ghost min-h-11 text-xs disabled:opacity-45"
            >
              助言する
            </button>
          )}
          {canManage && task.status !== "completed" && (
            <button
              type="button"
              onClick={() => onOpenRequestForm("assignment", task.id)}
              disabled={busy}
              className="quest-btn-ghost min-h-11 text-xs disabled:opacity-45"
            >
              指名依頼
            </button>
          )}
          {canManage && canUseDirective && task.status !== "completed" && (
            <button
              type="button"
              onClick={() => onOpenRequestForm("directive", task.id)}
              disabled={busy}
              className="quest-btn-ghost min-h-11 border-red-400/70 text-red-200 disabled:opacity-45"
            >
              ギルド指令
            </button>
          )}
          {canManage && task.status !== "completed" && task.status !== "delegated" && (
            <button
              type="button"
              onClick={() => onOpenDetail(task.id)}
              disabled={busy}
              className="quest-btn-ghost min-h-11 text-xs disabled:opacity-45"
            >
              詳細
            </button>
          )}
          {canManage && task.status !== "completed" && task.status !== "delegated" && (
            <button
              type="button"
              onClick={() => onEdit(task.id)}
              disabled={busy}
              className="quest-btn-ghost min-h-11 text-xs disabled:opacity-45"
            >
              編集
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function TaskFormModal({
  open,
  mode,
  initial,
  defaults,
  selectedPlayer,
  calendarEvents,
  submitting,
  onClose,
  onSubmit,
}: {
  open: boolean;
  mode: "create" | "edit";
  initial: AdventurerTask | null;
  defaults?: Partial<AdventurerTaskFormData>;
  selectedPlayer: string;
  calendarEvents: CalendarEvent[];
  submitting: boolean;
  onClose: () => void;
  onSubmit: (data: AdventurerTaskFormData) => void;
}) {
  const [form, setForm] = useState<AdventurerTaskFormData>(EMPTY_TASK_FORM);
  const [error, setError] = useState<string | null>(null);

  const eventOptions = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return [...calendarEvents]
      .filter(
        (event) =>
          isGuildWideCalendarEvent(event) || event.id === form.calendarEventId,
      )
      .sort((a, b) => {
        const aFuture = a.eventDate >= today ? 0 : 1;
        const bFuture = b.eventDate >= today ? 0 : 1;
        if (aFuture !== bFuture) return aFuture - bFuture;
        const date = a.eventDate.localeCompare(b.eventDate);
        if (date !== 0) return date;
        return (a.startTime || "99:99").localeCompare(b.startTime || "99:99");
      });
  }, [calendarEvents, form.calendarEventId]);

  useEffect(() => {
    if (!open) return;
    setForm(
      mode === "edit" && initial
        ? taskToForm(initial)
        : { ...EMPTY_TASK_FORM, ...defaults },
    );
    setError(null);
  }, [open, mode, initial, defaults]);

  if (!open) return null;

  const update = <K extends keyof AdventurerTaskFormData>(
    key: K,
    value: AdventurerTaskFormData[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (error) setError(null);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    if (!form.title.trim()) {
      setError("任務名を入力してください");
      return;
    }
    onSubmit({
      ...form,
      title: form.title.trim(),
      description: form.description.trim(),
    });
  };

  return (
    <div
      className="fixed inset-0 z-[67] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-form-title"
    >
      <button
        type="button"
        className="modal-backdrop absolute inset-0 bg-black/80"
        aria-label="任務フォームを閉じる"
        onClick={submitting ? undefined : onClose}
      />
      <section className="modal-panel relative rpg-frame max-h-[92dvh] w-full max-w-2xl overflow-y-auto custom-scroll p-5">
        <header className="border-b-2 border-[var(--color-gold)]/30 pb-3">
          <p className="font-[family-name:var(--font-display)] text-[10px] tracking-[0.22em] text-[var(--color-gold)]/80">
            ADVENTURER NOTEBOOK
          </p>
          <h2 id="task-form-title" className="pixel-window-title mt-1 text-xl font-bold">
            {mode === "create" ? "任務を記す" : "任務を編集"}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            持ち主: {initial?.ownerName ?? selectedPlayer}
          </p>
        </header>

        <form onSubmit={handleSubmit} className="mt-4 grid gap-3">
          <label className="block">
            <span className="quest-pixel-label text-[10px] text-[var(--color-gold)]">
              任務名 *
            </span>
            <input
              value={form.title}
              onChange={(event) => update("title", event.target.value)}
              disabled={submitting}
              className="quest-input mt-1.5"
              placeholder="例: 景品補充"
            />
          </label>

          <label>
            <span className="quest-pixel-label text-[10px] text-[var(--color-gold)]">
              説明
            </span>
            <textarea
              value={form.description}
              onChange={(event) => update("description", event.target.value)}
              disabled={submitting}
              rows={3}
              className="quest-input mt-1.5 resize-none"
              placeholder="作業内容や注意点..."
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <TaskScoreInput
              label="緊急度"
              value={form.priority}
              onChange={(value) => update("priority", value)}
              disabled={submitting}
            />
            <TaskScoreInput
              label="重要度"
              value={form.importance}
              onChange={(value) => update("importance", value)}
              disabled={submitting}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="quest-pixel-label text-[10px] text-[var(--color-gold)]">
                納期
              </span>
              <input
                type="date"
                value={form.dueDate}
                onChange={(event) => update("dueDate", event.target.value)}
                disabled={submitting}
                className="quest-input mt-1.5"
              />
            </label>
            <label>
              <span className="quest-pixel-label text-[10px] text-[var(--color-gold)]">
                既存予定と関連
              </span>
              <select
                value={form.calendarEventId ?? ""}
                onChange={(event) =>
                  update(
                    "calendarEventId",
                    event.target.value ? Number(event.target.value) : null,
                  )
                }
                disabled={submitting}
                className="quest-input mt-1.5"
              >
                <option value="">関連なし</option>
                {eventOptions.map((event) => (
                  <option key={event.id} value={event.id}>
                    {formatCalendarDate(event.eventDate)} {formatEventTime(event)} [{EVENT_TYPE_LABELS[event.eventType]}] {event.title}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex min-h-11 items-center gap-3 border-2 border-white/15 bg-black/20 px-3 py-2 shadow-[3px_3px_0_#000]">
            <input
              type="checkbox"
              checked={form.isPublic}
              onChange={(event) => update("isPublic", event.target.checked)}
              disabled={submitting}
              className="h-5 w-5 accent-[var(--color-gold-bright)]"
            />
            <span className="min-w-0">
              <span className="block text-sm text-slate-100">公開設定</span>
              <span className="block text-[11px] text-slate-500">
                ONにするとギルド全体から見える任務になります。
              </span>
            </span>
          </label>

          <div className="border-2 border-[var(--color-gold)]/45 bg-black/30 px-3 py-2 text-xs text-slate-400 shadow-[3px_3px_0_#000]">
            依頼ランク:{" "}
            <span className="text-[var(--color-gold-bright)] font-bold">
              {form.priority * form.importance}
            </span>
            <span className="ml-2 text-slate-500">
              緊急度 × 重要度で自動計算されます
            </span>
          </div>

          {error && (
            <p className="border-2 border-red-400/55 bg-red-500/10 px-3 py-2 text-sm text-red-200 shadow-[3px_3px_0_#000]">
              {error}
            </p>
          )}

          <footer className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="quest-btn-secondary disabled:opacity-45"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="quest-btn-primary disabled:opacity-45"
            >
              {mode === "create" ? "手帳に記す" : "保存する"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function TaskDetailModal({
  task,
  relatedEvent,
  relatedQuest,
  disabled,
  onClose,
  onEdit,
  onDelete,
  onDelegate,
  onComplete,
  onOpenQuest,
  onOpenEvent,
}: {
  task: AdventurerTask | null;
  relatedEvent: CalendarEvent | null;
  relatedQuest: Quest | null;
  disabled: boolean;
  onClose: () => void;
  onEdit: (taskId: number) => void;
  onDelete: (taskId: number) => void;
  onDelegate: (taskId: number) => void;
  onComplete: (taskId: number) => void;
  onOpenQuest: (questId: number) => void;
  onOpenEvent: (eventId: number) => void;
}) {
  if (!task) return null;

  return (
    <div
      className="fixed inset-0 z-[68] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-detail-title"
    >
      <button
        type="button"
        className="modal-backdrop absolute inset-0 bg-black/80"
        aria-label="任務詳細を閉じる"
        onClick={disabled ? undefined : onClose}
      />
      <section className="modal-panel relative rpg-frame max-h-[92dvh] w-full max-w-2xl overflow-y-auto custom-scroll p-5">
        <header className="border-b-2 border-[var(--color-gold)]/30 pb-3">
          <div className="mb-2 flex flex-wrap gap-1">
            <span className={`task-status-badge task-status-${task.status}`}>
              {TASK_STATUS_LABELS[task.status]}
            </span>
            <span className="calendar-tag">依頼ランク {getTaskScore(task)}</span>
            <span className="calendar-tag">{getTaskDueLabel(task)}</span>
          </div>
          <h2 id="task-detail-title" className="pixel-window-title text-xl font-bold">
            {task.title}
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            持ち主: {task.ownerName} / 緊急 {task.priority} / 重要 {task.importance}
          </p>
        </header>

        <section className="mt-4 border-2 border-white/15 bg-black/20 p-3 shadow-[3px_3px_0_#000]">
          <h3 className="pixel-title text-sm text-[var(--color-gold-bright)]">
            任務内容
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            {task.description || "説明はありません。"}
          </p>
        </section>

        {relatedEvent && (
          <section className="mt-4 border-2 border-[var(--color-gold)]/35 bg-black/20 p-3 shadow-[3px_3px_0_#000]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="pixel-title text-sm text-[var(--color-gold-bright)]">
                  関連予定
                </h3>
                <p className="mt-2 text-sm text-slate-300">{relatedEvent.title}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {formatCalendarDate(relatedEvent.eventDate)} / {formatEventTime(relatedEvent)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onOpenEvent(relatedEvent.id)}
                disabled={disabled}
                className="quest-btn-ghost min-h-11 px-3 text-xs disabled:opacity-45"
              >
                予定詳細
              </button>
            </div>
          </section>
        )}

        {relatedQuest && (
          <section className="mt-4 border-2 border-[var(--color-gold)]/35 bg-black/20 p-3 shadow-[3px_3px_0_#000]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="pixel-title text-sm text-[var(--color-gold-bright)]">
                  関連依頼
                </h3>
                <p className="mt-2 text-sm text-slate-300">{relatedQuest.title}</p>
                <p className="mt-1 text-xs text-slate-500">
                  状態: {relatedQuest.status} / 依頼ランク {getPriorityScore(relatedQuest)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onOpenQuest(relatedQuest.id)}
                disabled={disabled}
                className="quest-btn-ghost min-h-11 px-3 text-xs disabled:opacity-45"
              >
                依頼詳細
              </button>
            </div>
          </section>
        )}

        <footer className="mt-5 grid gap-2 sm:grid-cols-4">
          <button
            type="button"
            onClick={onClose}
            disabled={disabled}
            className="quest-btn-secondary disabled:opacity-45"
          >
            戻る
          </button>
          {task.status !== "completed" && task.status !== "delegated" && (
            <>
              <button
                type="button"
                onClick={() => onComplete(task.id)}
                disabled={disabled}
                className="quest-btn-primary disabled:opacity-45"
              >
                任務完了
              </button>
              <button
                type="button"
                onClick={() => onDelegate(task.id)}
                disabled={disabled}
                className="quest-btn-ghost disabled:opacity-45"
              >
                任務を依頼書化
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => onEdit(task.id)}
            disabled={disabled || task.status === "completed"}
            className="quest-btn-ghost disabled:opacity-45"
          >
            編集
          </button>
          <button
            type="button"
            onClick={() => onDelete(task.id)}
            disabled={disabled}
            className="quest-btn-ghost border-red-400/70 text-red-200 disabled:opacity-45"
          >
            削除
          </button>
        </footer>
      </section>
    </div>
  );
}

function QuestPublishModal({
  open,
  task,
  submitting,
  onClose,
  onSubmit,
}: {
  open: boolean;
  task: AdventurerTask | null;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (data: QuestPublishFormData) => void;
}) {
  const [form, setForm] = useState<QuestPublishFormData>(() =>
    task ? questPublishDefaults(task) : questPublishFallback(),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !task) return;
    setForm(questPublishDefaults(task));
    setError(null);
  }, [open, task]);

  if (!open || !task) return null;

  const update = <K extends keyof QuestPublishFormData>(
    key: K,
    value: QuestPublishFormData[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (error) setError(null);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    if (!form.title.trim()) {
      setError("依頼タイトルを入力してください");
      return;
    }
    if (!form.dueDate || !form.dueTime) {
      setError("納期の日付と時間を入力してください");
      return;
    }
    onSubmit({
      ...form,
      title: form.title.trim(),
      description: form.description.trim(),
      requiredMembers: Math.min(3, Math.max(1, form.requiredMembers)),
    });
  };

  return (
    <div
      className="fixed inset-0 z-[69] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quest-publish-title"
    >
      <button
        type="button"
        className="modal-backdrop absolute inset-0 bg-black/80"
        aria-label="依頼書設定を閉じる"
        onClick={submitting ? undefined : onClose}
      />
      <section className="modal-panel relative rpg-frame max-h-[92dvh] w-full max-w-2xl overflow-y-auto custom-scroll p-5">
        <header className="border-b-2 border-[var(--color-gold)]/30 pb-3">
          <p className="font-[family-name:var(--font-display)] text-[10px] tracking-[0.22em] text-[var(--color-gold)]/80">
            REQUEST SHEET
          </p>
          <h2 id="quest-publish-title" className="pixel-window-title mt-1 text-xl font-bold">
            依頼書設定
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            冒険者手帳の任務をギルド依頼として掲示します。
          </p>
        </header>

        <form onSubmit={handleSubmit} className="mt-4 grid gap-3">
          <label>
            <span className="quest-pixel-label text-[10px] text-[var(--color-gold)]">
              依頼タイトル *
            </span>
            <input
              value={form.title}
              onChange={(event) => update("title", event.target.value)}
              disabled={submitting}
              className="quest-input mt-1.5"
              placeholder="例: 開店前の景品棚フェイスアップ"
            />
          </label>

          <label>
            <span className="quest-pixel-label text-[10px] text-[var(--color-gold)]">
              詳細説明
            </span>
            <textarea
              value={form.description}
              onChange={(event) => update("description", event.target.value)}
              disabled={submitting}
              rows={4}
              className="quest-input mt-1.5 resize-none"
              placeholder="依頼を受ける人に伝える手順や注意点..."
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-3">
            <label>
              <span className="quest-pixel-label text-[10px] text-[var(--color-gold)]">
                難易度
              </span>
              <select
                value={form.difficulty}
                onChange={(event) =>
                  update("difficulty", Number(event.target.value) as QuestDifficulty)
                }
                disabled={submitting}
                className="quest-input mt-1.5"
              >
                {([1, 2, 3, 4, 5] as QuestDifficulty[]).map((difficulty) => (
                  <option key={difficulty} value={difficulty}>
                    Lv {QUEST_DIFFICULTY_LABELS[difficulty]}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="quest-pixel-label text-[10px] text-[var(--color-gold)]">
                推定時間
              </span>
              <select
                value={form.estimatedMinutes}
                onChange={(event) =>
                  update("estimatedMinutes", Number(event.target.value))
                }
                disabled={submitting}
                className="quest-input mt-1.5"
              >
                {ESTIMATED_MINUTE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="quest-pixel-label text-[10px] text-[var(--color-gold)]">
                必要人員
              </span>
              <select
                value={form.requiredMembers}
                onChange={(event) =>
                  update("requiredMembers", Number(event.target.value))
                }
                disabled={submitting}
                className="quest-input mt-1.5"
              >
                {[1, 2, 3].map((count) => (
                  <option key={count} value={count}>
                    {count}人
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="quest-pixel-label text-[10px] text-[var(--color-gold)]">
                納期日 *
              </span>
              <input
                type="date"
                value={form.dueDate}
                onChange={(event) => update("dueDate", event.target.value)}
                disabled={submitting}
                className="quest-input mt-1.5"
              />
            </label>
            <label>
              <span className="quest-pixel-label text-[10px] text-[var(--color-gold)]">
                納期時間 *
              </span>
              <input
                type="time"
                value={form.dueTime}
                onChange={(event) => update("dueTime", event.target.value)}
                disabled={submitting}
                className="quest-input mt-1.5"
              />
            </label>
          </div>

          <div className="border-2 border-[var(--color-gold)]/45 bg-black/30 px-3 py-2 text-xs text-slate-400 shadow-[3px_3px_0_#000]">
            元任務: <span className="text-slate-200">{task.title}</span>
            <span className="ml-2 text-slate-500">
              掲示後は手帳側が「依頼中」になります。
            </span>
          </div>

          {error && (
            <p className="border-2 border-red-400/55 bg-red-500/10 px-3 py-2 text-sm text-red-200 shadow-[3px_3px_0_#000]">
              {error}
            </p>
          )}

          <footer className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="quest-btn-secondary disabled:opacity-45"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="quest-btn-primary disabled:opacity-45"
            >
              依頼書を掲示
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function questPublishDefaults(task: AdventurerTask): QuestPublishFormData {
  return {
    title: task.title,
    description: task.description,
    difficulty: difficultyFromTask(task),
    estimatedMinutes: 30,
    dueDate: task.dueDate || toDateInputValue(new Date()),
    dueTime: "18:00",
    requiredMembers: 1,
  };
}

function questPublishFallback(): QuestPublishFormData {
  return {
    title: "",
    description: "",
    difficulty: 3,
    estimatedMinutes: 30,
    dueDate: toDateInputValue(new Date()),
    dueTime: "18:00",
    requiredMembers: 1,
  };
}

function difficultyFromTask(task: AdventurerTask): QuestDifficulty {
  const score = getTaskScore(task);
  if (score >= 20) return 5;
  if (score >= 12) return 4;
  if (score >= 8) return 3;
  if (score >= 4) return 2;
  return 1;
}

function DirectQuestPostModal({
  open,
  selectedPlayer,
  staff,
  calendarEvents,
  submitting,
  onClose,
  onSubmit,
}: {
  open: boolean;
  selectedPlayer: string;
  staff: PartyMember[];
  calendarEvents: CalendarEvent[];
  submitting: boolean;
  onClose: () => void;
  onSubmit: (data: DirectQuestPostFormData) => void;
}) {
  const activeStaff = useMemo(
    () => staff.filter((member) => member.isActive !== false),
    [staff],
  );
  const eventOptions = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return [...calendarEvents]
      .filter(isGuildWideCalendarEvent)
      .sort((a, b) => {
        const aFuture = a.eventDate >= today ? 0 : 1;
        const bFuture = b.eventDate >= today ? 0 : 1;
        if (aFuture !== bFuture) return aFuture - bFuture;
        const date = a.eventDate.localeCompare(b.eventDate);
        if (date !== 0) return date;
        return (a.startTime || "99:99").localeCompare(b.startTime || "99:99");
      });
  }, [calendarEvents]);
  const [form, setForm] = useState<DirectQuestPostFormData>({
    requesterName: selectedPlayer,
    title: "",
    description: "",
    difficulty: 3,
    urgency: 3,
    importance: 3,
    estimatedMinutes: 30,
    dueDate: toDateInputValue(new Date()),
    dueTime: "18:00",
    requiredMembers: 1,
    calendarEventId: null,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const requester =
      activeStaff.find((member) => member.name === selectedPlayer)?.name ??
      activeStaff[0]?.name ??
      selectedPlayer;
    setForm({
      requesterName: requester,
      title: "",
      description: "",
      difficulty: 3,
      urgency: 3,
      importance: 3,
      estimatedMinutes: 30,
      dueDate: toDateInputValue(new Date()),
      dueTime: "18:00",
      requiredMembers: 1,
      calendarEventId: null,
    });
    setError(null);
  }, [activeStaff, open, selectedPlayer]);

  if (!open) return null;

  const update = <K extends keyof DirectQuestPostFormData>(
    key: K,
    value: DirectQuestPostFormData[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (error) setError(null);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    if (!form.requesterName.trim()) {
      setError("依頼者を選択してください");
      return;
    }
    if (!form.title.trim()) {
      setError("依頼タイトルを入力してください");
      return;
    }
    if (!form.dueDate || !form.dueTime) {
      setError("納期の日付と時間を入力してください");
      return;
    }
    onSubmit({
      ...form,
      requesterName: form.requesterName.trim(),
      title: form.title.trim(),
      description: form.description.trim(),
      urgency: Math.min(5, Math.max(1, form.urgency)),
      importance: Math.min(5, Math.max(1, form.importance)),
      requiredMembers: Math.min(3, Math.max(1, form.requiredMembers)),
    });
  };

  return (
    <div
      className="fixed inset-0 z-[69] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="direct-quest-post-title"
    >
      <button
        type="button"
        className="modal-backdrop absolute inset-0 bg-black/80"
        aria-label="依頼直掲示フォームを閉じる"
        onClick={submitting ? undefined : onClose}
      />
      <section className="modal-panel relative rpg-frame max-h-[92dvh] w-full max-w-2xl overflow-y-auto custom-scroll p-5">
        <header className="border-b-2 border-[var(--color-gold)]/30 pb-3">
          <p className="font-[family-name:var(--font-display)] text-[10px] tracking-[0.22em] text-[var(--color-gold)]/80">
            DIRECT REQUEST
          </p>
          <h2 id="direct-quest-post-title" className="pixel-window-title mt-1 text-xl font-bold">
            依頼を直掲示
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            急ぎの依頼を直接掲示します。内部では自動で冒険者手帳の任務も作成されます。
          </p>
        </header>

        <form onSubmit={handleSubmit} className="mt-4 grid gap-3">
          <label>
            <span className="quest-pixel-label text-[10px] text-[var(--color-gold)]">
              依頼者 *
            </span>
            <select
              value={form.requesterName}
              onChange={(event) => update("requesterName", event.target.value)}
              disabled={submitting}
              className="quest-input mt-1.5"
            >
              <option value="">依頼者を選択</option>
              {activeStaff.map((member) => (
                <option key={member.id} value={member.name}>
                  {member.name} Lv.{member.level}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="quest-pixel-label text-[10px] text-[var(--color-gold)]">
              依頼タイトル *
            </span>
            <input
              value={form.title}
              onChange={(event) => update("title", event.target.value)}
              disabled={submitting}
              className="quest-input mt-1.5"
              placeholder="例: 景品補充"
            />
          </label>

          <label>
            <span className="quest-pixel-label text-[10px] text-[var(--color-gold)]">
              詳細説明
            </span>
            <textarea
              value={form.description}
              onChange={(event) => update("description", event.target.value)}
              disabled={submitting}
              rows={3}
              className="quest-input mt-1.5 resize-none"
              placeholder="依頼内容、作業場所、注意点..."
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-3">
            <label>
              <span className="quest-pixel-label text-[10px] text-[var(--color-gold)]">
                Lv
              </span>
              <select
                value={form.difficulty}
                onChange={(event) =>
                  update("difficulty", Number(event.target.value) as QuestDifficulty)
                }
                disabled={submitting}
                className="quest-input mt-1.5"
              >
                {([1, 2, 3, 4, 5] as QuestDifficulty[]).map((difficulty) => (
                  <option key={difficulty} value={difficulty}>
                    Lv {QUEST_DIFFICULTY_LABELS[difficulty]}
                  </option>
                ))}
              </select>
            </label>
            <TaskScoreInput
              label="緊急度"
              value={form.urgency}
              onChange={(value) => update("urgency", value)}
              disabled={submitting}
            />
            <TaskScoreInput
              label="重要度"
              value={form.importance}
              onChange={(value) => update("importance", value)}
              disabled={submitting}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label>
              <span className="quest-pixel-label text-[10px] text-[var(--color-gold)]">
                推定時間
              </span>
              <select
                value={form.estimatedMinutes}
                onChange={(event) =>
                  update("estimatedMinutes", Number(event.target.value))
                }
                disabled={submitting}
                className="quest-input mt-1.5"
              >
                {DIRECT_POST_ESTIMATED_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="quest-pixel-label text-[10px] text-[var(--color-gold)]">
                必要人員
              </span>
              <select
                value={form.requiredMembers}
                onChange={(event) =>
                  update("requiredMembers", Number(event.target.value))
                }
                disabled={submitting}
                className="quest-input mt-1.5"
              >
                {[1, 2, 3].map((count) => (
                  <option key={count} value={count}>
                    {count}人
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="quest-pixel-label text-[10px] text-[var(--color-gold)]">
                関連予定
              </span>
              <select
                value={form.calendarEventId ?? ""}
                onChange={(event) =>
                  update(
                    "calendarEventId",
                    event.target.value ? Number(event.target.value) : null,
                  )
                }
                disabled={submitting}
                className="quest-input mt-1.5"
              >
                <option value="">関連なし</option>
                {eventOptions.map((event) => (
                  <option key={event.id} value={event.id}>
                    {formatCalendarDate(event.eventDate)} {formatEventTime(event)} [{EVENT_TYPE_LABELS[event.eventType]}] {event.title}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="quest-pixel-label text-[10px] text-[var(--color-gold)]">
                納期日 *
              </span>
              <input
                type="date"
                value={form.dueDate}
                onChange={(event) => update("dueDate", event.target.value)}
                disabled={submitting}
                className="quest-input mt-1.5"
              />
            </label>
            <label>
              <span className="quest-pixel-label text-[10px] text-[var(--color-gold)]">
                納期時間 *
              </span>
              <input
                type="time"
                value={form.dueTime}
                onChange={(event) => update("dueTime", event.target.value)}
                disabled={submitting}
                className="quest-input mt-1.5"
              />
            </label>
          </div>

          <div className="border-2 border-[var(--color-gold)]/45 bg-black/30 px-3 py-2 text-xs text-slate-400 shadow-[3px_3px_0_#000]">
            依頼ランク:{" "}
            <span className="text-[var(--color-gold-bright)] font-bold">
              {form.urgency * form.importance}
            </span>
            <span className="ml-2 text-slate-500">
              公開任務として記録され、すぐギルド依頼へ掲載されます。
            </span>
          </div>

          {error && (
            <p className="border-2 border-red-400/55 bg-red-500/10 px-3 py-2 text-sm text-red-200 shadow-[3px_3px_0_#000]">
              {error}
            </p>
          )}

          <footer className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="quest-btn-secondary disabled:opacity-45"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="quest-btn-primary disabled:opacity-45"
            >
              直接依頼を掲示
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function GuildRequestFormModal({
  open,
  requestType,
  sourceTask,
  staff,
  selectedPlayer,
  calendarEvents,
  canIssueDirective: canUseDirective,
  submitting,
  onClose,
  onSubmit,
}: {
  open: boolean;
  requestType: GuildRequestType;
  sourceTask: AdventurerTask | null;
  staff: PartyMember[];
  selectedPlayer: string;
  calendarEvents: CalendarEvent[];
  canIssueDirective: boolean;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (data: GuildRequestFormData) => void;
}) {
  const [form, setForm] = useState<GuildRequestFormData>({
    requestType,
    toPlayer: "",
    taskTitle: "",
    taskDescription: "",
    priority: 3,
    importance: 3,
    dueDate: "",
    calendarEventId: null,
  });
  const [error, setError] = useState<string | null>(null);

  const activeStaff = useMemo(
    () => staff.filter((member) => member.isActive !== false),
    [staff],
  );
  const targetStaff = activeStaff.filter((member) => member.name !== selectedPlayer);

  const eventOptions = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return [...calendarEvents]
      .filter(
        (event) =>
          isGuildWideCalendarEvent(event) || event.id === form.calendarEventId,
      )
      .sort((a, b) => {
        const aFuture = a.eventDate >= today ? 0 : 1;
        const bFuture = b.eventDate >= today ? 0 : 1;
        if (aFuture !== bFuture) return aFuture - bFuture;
        return a.eventDate.localeCompare(b.eventDate);
      });
  }, [calendarEvents, form.calendarEventId]);

  useEffect(() => {
    if (!open) return;
    setForm({
      requestType,
      toPlayer: requestType === "directive" ? "__all__" : "",
      taskTitle: sourceTask?.title ?? "",
      taskDescription: sourceTask?.description ?? "",
      priority: sourceTask?.priority ?? 3,
      importance: sourceTask?.importance ?? 3,
      dueDate: sourceTask?.dueDate ?? "",
      calendarEventId: sourceTask?.calendarEventId ?? null,
    });
    setError(null);
  }, [open, requestType, sourceTask]);

  if (!open) return null;

  const update = <K extends keyof GuildRequestFormData>(
    key: K,
    value: GuildRequestFormData[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (error) setError(null);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    if (requestType === "directive" && !canUseDirective) {
      setError("ギルド指令はサブマスター以上のみ発令できます");
      return;
    }
    if (!form.toPlayer) {
      setError("対象冒険者を選択してください");
      return;
    }
    if (!form.taskTitle.trim()) {
      setError("任務名を入力してください");
      return;
    }
    onSubmit({
      ...form,
      taskTitle: form.taskTitle.trim(),
      taskDescription: form.taskDescription.trim(),
    });
  };

  const title =
    requestType === "suggestion"
      ? "助言する"
      : requestType === "assignment"
        ? "指名依頼"
        : "ギルド指令";
  const subtitle =
    requestType === "suggestion"
      ? "提案は相手の承認後に手帳へ追加されます。"
      : requestType === "assignment"
        ? "承認後、手帳追加と依頼書化まで進みます。"
        : "管理者権限で対象者の手帳へ即時追加されます。";

  return (
    <div
      className="fixed inset-0 z-[69] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="guild-request-form-title"
    >
      <button
        type="button"
        className="modal-backdrop absolute inset-0 bg-black/80"
        aria-label="提案フォームを閉じる"
        onClick={submitting ? undefined : onClose}
      />
      <section className={`modal-panel guild-request-modal guild-request-${getRequestTone(requestType)} relative rpg-frame max-h-[92dvh] w-full max-w-2xl overflow-y-auto custom-scroll p-5`}>
        <header className="border-b-2 border-[var(--color-gold)]/30 pb-3">
          <p className="font-[family-name:var(--font-display)] text-[10px] tracking-[0.22em] text-[var(--color-gold)]/80">
            GUILD OPERATION
          </p>
          <h2 id="guild-request-form-title" className="pixel-window-title mt-1 text-xl font-bold">
            {title}
          </h2>
          <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
        </header>

        <form onSubmit={handleSubmit} className="mt-4 grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="quest-pixel-label text-[10px] text-[var(--color-gold)]">
                対象冒険者 *
              </span>
              <select
                value={form.toPlayer}
                onChange={(event) => update("toPlayer", event.target.value)}
                disabled={submitting}
                className="quest-input mt-1.5"
              >
                <option value="">対象を選択</option>
                {requestType === "directive" && (
                  <option value="__all__">全員</option>
                )}
                {targetStaff.map((member) => (
                  <option key={member.id} value={member.name}>
                    {member.name} Lv.{member.level}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="quest-pixel-label text-[10px] text-[var(--color-gold)]">
                既存予定と関連
              </span>
              <select
                value={form.calendarEventId ?? ""}
                onChange={(event) =>
                  update(
                    "calendarEventId",
                    event.target.value ? Number(event.target.value) : null,
                  )
                }
                disabled={submitting}
                className="quest-input mt-1.5"
              >
                <option value="">関連なし</option>
                {eventOptions.map((event) => (
                  <option key={event.id} value={event.id}>
                    {formatCalendarDate(event.eventDate)} [{EVENT_TYPE_LABELS[event.eventType]}] {event.title}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label>
            <span className="quest-pixel-label text-[10px] text-[var(--color-gold)]">
              任務名 *
            </span>
            <input
              value={form.taskTitle}
              onChange={(event) => update("taskTitle", event.target.value)}
              disabled={submitting}
              className="quest-input mt-1.5"
              placeholder="例: 景品補充"
            />
          </label>

          <label>
            <span className="quest-pixel-label text-[10px] text-[var(--color-gold)]">
              内容
            </span>
            <textarea
              value={form.taskDescription}
              onChange={(event) => update("taskDescription", event.target.value)}
              disabled={submitting}
              rows={3}
              className="quest-input mt-1.5 resize-none"
              placeholder="提案理由や依頼内容..."
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-3">
            <TaskScoreInput
              label="緊急度"
              value={form.priority}
              onChange={(value) => update("priority", value)}
              disabled={submitting}
            />
            <TaskScoreInput
              label="重要度"
              value={form.importance}
              onChange={(value) => update("importance", value)}
              disabled={submitting}
            />
            <label>
              <span className="quest-pixel-label text-[10px] text-[var(--color-gold)]">
                納期
              </span>
              <input
                type="date"
                value={form.dueDate}
                onChange={(event) => update("dueDate", event.target.value)}
                disabled={submitting}
                className="quest-input mt-1.5"
              />
            </label>
          </div>

          {error && (
            <p className="border-2 border-red-400/55 bg-red-500/10 px-3 py-2 text-sm text-red-200 shadow-[3px_3px_0_#000]">
              {error}
            </p>
          )}

          <footer className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="quest-btn-secondary disabled:opacity-45"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={submitting || (requestType === "directive" && !canUseDirective)}
              className="quest-btn-primary disabled:opacity-45"
            >
              {requestType === "suggestion"
                ? "助言を送る"
                : requestType === "assignment"
                  ? "指名依頼を送る"
                  : "指令を発令"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function GuildNoticesPanel({
  notices,
  requests,
  events,
  expeditions,
  selectedPlayer,
  loading,
  busy,
  onDismissNotice,
  onAcceptRequest,
  onRejectRequest,
}: {
  notices: GuildNotice[];
  requests: GuildRequest[];
  events: CalendarEvent[];
  expeditions: Expedition[];
  selectedPlayer: string;
  loading: boolean;
  busy: boolean;
  onDismissNotice: (noticeId: number) => void;
  onAcceptRequest: (request: GuildRequest) => void;
  onRejectRequest: (request: GuildRequest) => void;
}) {
  const [filter, setFilter] = useState<BulletinFilter>("all");
  const today = toDateInputValue(new Date());
  const weekRange = getWeekRange(new Date());
  const importantEvents = events
    .filter(
      (event) =>
        isGuildWideCalendarEvent(event) &&
        event.importance >= 4 &&
        event.eventDate >= today &&
        isDateWithinRange(event.eventDate, weekRange.start, weekRange.end),
    )
    .sort(compareCalendarEvents)
    .slice(0, 8);
  const readyExpeditions = expeditions.filter(
    (expedition) =>
      expedition.status === "completed" &&
      isExpeditionReady(expedition, Date.now()),
  );
  const filteredRequests = requests.filter((request) => {
    if (filter === "all") return true;
    if (filter === "request") {
      return request.requestType === "assignment" || request.requestType === "directive";
    }
    if (filter === "suggestion") return request.requestType === "suggestion";
    return false;
  });
  const filteredNotices = notices.filter((notice) => {
    if (filter === "all") return true;
    if (filter === "alert") {
      return notice.type === "deadline_warning" || notice.type === "overdue";
    }
    if (filter === "suggestion") return notice.type === "suggestion";
    return false;
  });
  const showEvents = filter === "all" || filter === "schedule";
  const showExpeditions = filter === "all" || filter === "expedition";

  if (loading) {
    return (
      <section className="rpg-frame min-h-0 flex-1 p-4">
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-[72px] animate-pulse border-2 border-white/15 bg-white/5 shadow-[2px_2px_0_#000]" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="notices-panel min-h-0 flex-1 overflow-hidden flex flex-col gap-2">
      <div className="rpg-frame notice-book-cover p-3 shrink-0">
        <p className="font-[family-name:var(--font-display)] text-[10px] tracking-[0.22em] text-[var(--color-gold)]/80">
          GUILD NEWS
        </p>
        <h3 className="pixel-window-title mt-1 text-base font-semibold">
          ギルド速報
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          {selectedPlayer} 宛ての依頼、助言、ギルド警報、重要予定を確認します。
        </p>
      </div>

      <div className={`min-h-0 flex-1 overflow-y-auto custom-scroll space-y-2 pb-20 lg:pb-1 pr-1 ${busy ? "opacity-80 pointer-events-none" : ""}`}>
        <BulletinFilters active={filter} onChange={setFilter} />

        {filteredRequests.length > 0 && (
          <section className="rpg-frame p-3">
            <header className="mb-3 border-b border-[var(--color-gold)]/25 pb-3">
              <h4 className="pixel-window-title text-sm font-semibold">
                受信した提案・依頼
              </h4>
            </header>
            <div className="grid gap-2">
              {filteredRequests.map((request) => (
                <GuildRequestCard
                  key={request.id}
                  request={request}
                  busy={busy}
                  onAccept={onAcceptRequest}
                  onReject={onRejectRequest}
                />
              ))}
            </div>
          </section>
        )}

        {showEvents && importantEvents.length > 0 && (
          <section className="rpg-frame p-3">
            <header className="mb-3 border-b border-[var(--color-gold)]/25 pb-3">
              <h4 className="pixel-window-title text-sm font-semibold">
                重要予定
              </h4>
            </header>
            <div className="grid gap-2">
              {importantEvents.map((event) => (
                <BulletinEventCard key={event.id} event={event} />
              ))}
            </div>
          </section>
        )}

        {showExpeditions && readyExpeditions.length > 0 && (
          <section className="rpg-frame p-3">
            <header className="mb-3 border-b border-[var(--color-gold)]/25 pb-3">
              <h4 className="pixel-window-title text-sm font-semibold">
                遠征帰還
              </h4>
            </header>
            <div className="grid gap-2">
              {readyExpeditions.map((expedition) => (
                <BulletinExpeditionCard
                  key={expedition.id}
                  expedition={expedition}
                />
              ))}
            </div>
          </section>
        )}

        <section className="rpg-frame p-3">
          <header className="mb-3 border-b border-[var(--color-gold)]/25 pb-3">
            <h4 className="pixel-window-title text-sm font-semibold">
              ギルド警報
            </h4>
          </header>
          {filteredNotices.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              今のところ新しい速報はありません。
            </p>
          ) : (
            <div className="grid gap-2">
              {filteredNotices.map((notice) => (
                <GuildNoticeCard
                  key={notice.id}
                  notice={notice}
                  busy={busy}
                  onDismiss={onDismissNotice}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

type BulletinFilter =
  | "all"
  | "alert"
  | "request"
  | "suggestion"
  | "schedule"
  | "expedition";

function BulletinFilters({
  active,
  onChange,
}: {
  active: BulletinFilter;
  onChange: (filter: BulletinFilter) => void;
}) {
  const filters: Array<{ id: BulletinFilter; label: string }> = [
    { id: "all", label: "すべて" },
    { id: "alert", label: "警報" },
    { id: "request", label: "依頼" },
    { id: "suggestion", label: "助言" },
    { id: "schedule", label: "予定" },
    { id: "expedition", label: "遠征" },
  ];

  return (
    <div className="quick-filter-bar -mx-3 px-3 py-1 bg-[#17101a] border-y-2 border-[#fff4c4]/35">
      <div className="flex gap-1.5 overflow-x-auto custom-scroll" role="tablist" aria-label="ギルド速報フィルター">
        {filters.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={active === item.id}
            onClick={() => onChange(item.id)}
            className={`pixel-chip min-h-10 shrink-0 px-2 text-[10px] font-semibold transition-all ${
              active === item.id
                ? "bg-[var(--color-gold-bright)] text-[#17101a]"
                : "bg-black/80 text-slate-300 hover:text-[var(--color-gold-bright)]"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function BulletinEventCard({ event }: { event: CalendarEvent }) {
  return (
    <article className="notice-scroll-card notice-type-system p-3">
      <div className="mb-1.5 flex flex-wrap gap-1.5">
        <span className="calendar-tag is-event">ギルド予定</span>
        <span className="calendar-tag">重要度{event.importance}</span>
      </div>
      <h4 className="pixel-title text-sm text-slate-100">{event.title}</h4>
      <p className="mt-1 text-xs leading-5 text-slate-400">
        {formatCalendarDate(event.eventDate)} {formatEventTime(event)}
      </p>
    </article>
  );
}

function BulletinExpeditionCard({ expedition }: { expedition: Expedition }) {
  return (
    <article className="notice-scroll-card notice-type-system p-3">
      <div className="mb-1.5 flex flex-wrap gap-1.5">
        <span className="calendar-tag">遠征</span>
        <span className="calendar-tag">帰還済み</span>
      </div>
      <h4 className="pixel-title text-sm text-slate-100">
        {expedition.expeditionName}
      </h4>
      <p className="mt-1 text-xs leading-5 text-slate-400">
        報酬を受け取れます。EXP +{expedition.rewardExp} / GOLD +{expedition.rewardGold}
      </p>
    </article>
  );
}

function GuildNoticeCard({
  notice,
  busy,
  onDismiss,
}: {
  notice: GuildNotice;
  busy: boolean;
  onDismiss: (noticeId: number) => void;
}) {
  return (
    <article className={`notice-scroll-card notice-type-${notice.type} p-3`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            <span className="calendar-tag">{NOTICE_TYPE_LABELS[notice.type]}</span>
            {notice.targetPlayer && (
              <span className="calendar-tag">宛先 {notice.targetPlayer}</span>
            )}
          </div>
          <h4 className="pixel-title text-sm text-slate-100">{notice.title}</h4>
          <p className="mt-1 text-xs leading-5 text-slate-400">{notice.message}</p>
        </div>
        <button
          type="button"
          onClick={() => onDismiss(notice.id)}
          disabled={busy}
          className="quest-btn-ghost min-h-11 shrink-0 px-3 text-xs disabled:opacity-45"
        >
          閉じる
        </button>
      </div>
    </article>
  );
}

function GuildRequestCard({
  request,
  busy,
  onAccept,
  onReject,
}: {
  request: GuildRequest;
  busy: boolean;
  onAccept: (request: GuildRequest) => void;
  onReject: (request: GuildRequest) => void;
}) {
  return (
    <article className={`guild-request-card guild-request-${getRequestTone(request.requestType)} p-3`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            <span className="calendar-tag">{REQUEST_TYPE_LABELS[request.requestType]}</span>
            <span className="calendar-tag">{REQUEST_STATUS_LABELS[request.status]}</span>
            <span className="calendar-tag">依頼ランク {request.priority * request.importance}</span>
          </div>
          <h4 className="pixel-title text-sm text-slate-100">{request.taskTitle}</h4>
          <p className="mt-1 text-xs text-slate-500">
            {request.fromPlayer || "ギルド"} から / 緊急 {request.priority} / 重要 {request.importance}
            {request.dueDate ? ` / 納期 ${request.dueDate.replaceAll("-", "/")}` : ""}
          </p>
          {request.taskDescription && (
            <p className="mt-2 text-xs leading-5 text-slate-400">
              {request.taskDescription}
            </p>
          )}
        </div>
        {request.requestType === "directive" && request.status !== "pending" ? (
          <span className="calendar-tag shrink-0 border-red-400/70 text-red-200">
            手帳へ追加済み
          </span>
        ) : (
          <div className="grid shrink-0 grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => onAccept(request)}
              disabled={busy}
              className="quest-btn-primary min-h-11 px-3 text-xs disabled:opacity-45"
            >
              承認
            </button>
            <button
              type="button"
              onClick={() => onReject(request)}
              disabled={busy}
              className="quest-btn-ghost min-h-11 px-3 text-xs disabled:opacity-45"
            >
              却下
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

function EmergencyReportModal({
  open,
  overdueCount,
  dueSoonCount,
  onClose,
  onOpenNotices,
}: {
  open: boolean;
  overdueCount: number;
  dueSoonCount: number;
  onClose: () => void;
  onOpenNotices: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center bg-black/82 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="emergency-report-title"
    >
      <section className="modal-panel rpg-frame max-w-md w-full p-5 text-center">
        <p className="text-4xl">⚠</p>
        <h2 id="emergency-report-title" className="pixel-window-title mt-3 text-xl font-bold">
          緊急報告
        </h2>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="border-2 border-red-400/70 bg-red-500/10 p-3 shadow-[3px_3px_0_#000]">
            <p className="text-xs text-red-200">納期切れ任務</p>
            <p className="pixel-title mt-1 text-2xl text-red-100">{overdueCount}</p>
          </div>
          <div className="border-2 border-yellow-300/70 bg-yellow-500/10 p-3 shadow-[3px_3px_0_#000]">
            <p className="text-xs text-yellow-100">期限間近</p>
            <p className="pixel-title mt-1 text-2xl text-yellow-100">{dueSoonCount}</p>
          </div>
        </div>
        <p className="mt-4 text-sm leading-6 text-slate-400">
          ギルド速報で確認し、必要なら助言・依頼で支援してください。
        </p>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={onOpenNotices} className="quest-btn-primary">
            ギルド速報へ
          </button>
          <button type="button" onClick={onClose} className="quest-btn-secondary">
            閉じる
          </button>
        </div>
      </section>
    </div>
  );
}

function TaskScoreInput({
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
        <span className="quest-pixel-label text-[10px] text-[var(--color-gold)]">
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

function renderScoreGems(value: number) {
  return `${"◆".repeat(value)}${"◇".repeat(Math.max(0, 5 - value))}`;
}

function CalendarEventFormModal({
  open,
  mode,
  initial,
  initialDate,
  staff,
  quests,
  submitting,
  onClose,
  onSubmit,
}: {
  open: boolean;
  mode: "create" | "edit";
  initial: CalendarEvent | null;
  initialDate: string;
  staff: PartyMember[];
  quests: Quest[];
  submitting: boolean;
  onClose: () => void;
  onSubmit: (data: CalendarEventFormData) => void;
}) {
  const [form, setForm] = useState<CalendarEventFormData>({
    ...EMPTY_EVENT_FORM,
    eventDate: initialDate,
  });
  const [error, setError] = useState<string | null>(null);
  const activeStaff = staff.filter((member) => member.isActive !== false);

  useEffect(() => {
    if (!open) return;
    setForm(
      mode === "edit" && initial
        ? eventToForm(initial)
        : { ...EMPTY_EVENT_FORM, eventDate: initialDate },
    );
    setError(null);
  }, [open, mode, initial, initialDate]);

  const eventTypeOptions = Object.entries(EVENT_TYPE_LABELS).filter(
    ([value]) => value !== "personal" || form.eventType === "personal",
  );

  if (!open) return null;

  const update = <K extends keyof CalendarEventFormData>(
    key: K,
    value: CalendarEventFormData[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (error) setError(null);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    if (!form.title.trim()) {
      setError("タイトルを入力してください");
      return;
    }
    if (!form.eventDate) {
      setError("日付を選択してください");
      return;
    }
    if (form.eventType === "personal" && !form.ownerName.trim()) {
      setError("対象者を選択してください");
      return;
    }
    onSubmit({
      ...form,
      title: form.title.trim(),
      description: form.description.trim(),
      ownerName: form.ownerName.trim(),
    });
  };

  return (
    <div
      className="fixed inset-0 z-[67] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="calendar-form-title"
    >
      <button
        type="button"
        className="modal-backdrop absolute inset-0 bg-black/80"
        aria-label="予定フォームを閉じる"
        onClick={submitting ? undefined : onClose}
      />
      <section className="modal-panel relative rpg-frame max-h-[92dvh] w-full max-w-2xl overflow-y-auto custom-scroll p-5">
        <header className="border-b-2 border-[var(--color-gold)]/30 pb-3">
          <p className="font-[family-name:var(--font-display)] text-[10px] tracking-[0.22em] text-[var(--color-gold)]/80">
            GUILD CALENDAR
          </p>
          <h2 id="calendar-form-title" className="pixel-window-title mt-1 text-xl font-bold">
            {mode === "create" ? "予定を追加" : "予定を編集"}
          </h2>
        </header>

        <form onSubmit={handleSubmit} className="mt-4 grid gap-3">
          <label className="block">
            <span className="quest-pixel-label text-[10px] text-[var(--color-gold)]">タイトル *</span>
            <input
              value={form.title}
              onChange={(event) => update("title", event.target.value)}
              disabled={submitting}
              className="quest-input mt-1.5"
              placeholder="例: 棚卸し"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-3">
            <label>
              <span className="quest-pixel-label text-[10px] text-[var(--color-gold)]">日付 *</span>
              <input
                type="date"
                value={form.eventDate}
                onChange={(event) => update("eventDate", event.target.value)}
                disabled={submitting}
                className="quest-input mt-1.5"
              />
            </label>
            <label>
              <span className="quest-pixel-label text-[10px] text-[var(--color-gold)]">開始時間</span>
              <input
                type="time"
                value={form.startTime}
                onChange={(event) => update("startTime", event.target.value)}
                disabled={submitting}
                className="quest-input mt-1.5"
              />
            </label>
            <label>
              <span className="quest-pixel-label text-[10px] text-[var(--color-gold)]">終了時間</span>
              <input
                type="time"
                value={form.endTime}
                onChange={(event) => update("endTime", event.target.value)}
                disabled={submitting}
                className="quest-input mt-1.5"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label>
              <span className="quest-pixel-label text-[10px] text-[var(--color-gold)]">種別</span>
              <select
                value={form.eventType}
                onChange={(event) =>
                  update("eventType", event.target.value as CalendarEventType)
                }
                disabled={submitting}
                className="quest-input mt-1.5"
              >
                {eventTypeOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="quest-pixel-label text-[10px] text-[var(--color-gold)]">重要度</span>
              <select
                value={form.importance}
                onChange={(event) => update("importance", Number(event.target.value))}
                disabled={submitting}
                className="quest-input mt-1.5"
              >
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={value}>
                    {value} / {IMPORTANCE_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="quest-pixel-label text-[10px] text-[var(--color-gold)]">
                対象者{form.eventType === "personal" ? " *" : ""}
              </span>
              <select
                value={form.ownerName}
                onChange={(event) => update("ownerName", event.target.value)}
                disabled={submitting}
                className="quest-input mt-1.5"
              >
                <option value="">未選択</option>
                {activeStaff.map((member) => (
                  <option key={member.id} value={member.name}>
                    {member.name} Lv.{member.level}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label>
            <span className="quest-pixel-label text-[10px] text-[var(--color-gold)]">関連クエスト</span>
            <select
              value={form.linkedQuestId ?? ""}
              onChange={(event) =>
                update(
                  "linkedQuestId",
                  event.target.value ? Number(event.target.value) : null,
                )
              }
              disabled={submitting}
              className="quest-input mt-1.5"
            >
              <option value="">未選択</option>
              {quests.map((quest) => (
                <option key={quest.id} value={quest.id}>
                  {quest.title}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="quest-pixel-label text-[10px] text-[var(--color-gold)]">説明</span>
            <textarea
              value={form.description}
              onChange={(event) => update("description", event.target.value)}
              disabled={submitting}
              rows={3}
              className="quest-input mt-1.5 resize-none"
              placeholder="予定の詳細や注意点..."
            />
          </label>

          {error && (
            <p className="border-2 border-red-400/55 bg-red-500/10 px-3 py-2 text-sm text-red-200 shadow-[3px_3px_0_#000]">
              {error}
            </p>
          )}

          <footer className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="quest-btn-secondary disabled:opacity-45"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="quest-btn-primary disabled:opacity-45"
            >
              {mode === "create" ? "予定を記す" : "保存する"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function CalendarEventDetailModal({
  event,
  relatedTasks,
  relatedQuests,
  disabled,
  onClose,
  onEdit,
  onDelete,
  onCreateTask,
}: {
  event: CalendarEvent | null;
  relatedTasks: AdventurerTask[];
  relatedQuests: Quest[];
  disabled: boolean;
  onClose: () => void;
  onEdit: (eventId: number) => void;
  onDelete: (event: CalendarEvent) => void;
  onCreateTask: (event: CalendarEvent) => void;
}) {
  if (!event) return null;

  return (
    <div
      className="fixed inset-0 z-[68] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="calendar-detail-title"
    >
      <button
        type="button"
        className="modal-backdrop absolute inset-0 bg-black/80"
        aria-label="予定詳細を閉じる"
        onClick={disabled ? undefined : onClose}
      />
      <section className="modal-panel relative rpg-frame max-h-[92dvh] w-full max-w-xl overflow-y-auto custom-scroll p-5">
        <header className="border-b-2 border-[var(--color-gold)]/30 pb-3">
          <div className="mb-2 flex flex-wrap gap-1">
            <span className={`calendar-tag ${EVENT_TYPE_TONES[event.eventType]}`}>
              {EVENT_TYPE_LABELS[event.eventType]}
            </span>
            <span className="calendar-tag">重要度{event.importance}</span>
          </div>
          <h2 id="calendar-detail-title" className="pixel-window-title text-xl font-bold">
            {event.title}
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            {formatCalendarDate(event.eventDate)} / {formatEventTime(event)}
            {event.ownerName ? ` / 対象者: ${event.ownerName}` : ""}
          </p>
        </header>

        {event.description && (
          <section className="mt-4 border-2 border-white/15 bg-black/20 p-3 shadow-[3px_3px_0_#000]">
            <h3 className="pixel-title text-sm text-[var(--color-gold-bright)]">予定メモ</h3>
            <p className="mt-2 text-sm leading-6 text-slate-300">{event.description}</p>
          </section>
        )}

        <section className="mt-4 border-2 border-white/15 bg-black/20 p-3 shadow-[3px_3px_0_#000]">
          <h3 className="pixel-title text-sm text-[var(--color-gold-bright)]">関連任務</h3>
          {relatedTasks.length > 0 ? (
            <div className="mt-2 grid gap-1.5">
              {relatedTasks.map((task) => (
                <p key={task.id} className="text-sm text-slate-300">
                  {task.title} / {TASK_STATUS_LABELS[task.status]} / {task.ownerName}
                </p>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-500">関連任務はありません。</p>
          )}
        </section>

        <section className="mt-4 border-2 border-white/15 bg-black/20 p-3 shadow-[3px_3px_0_#000]">
          <h3 className="pixel-title text-sm text-[var(--color-gold-bright)]">関連依頼</h3>
          {relatedQuests.length > 0 ? (
            <div className="mt-2 grid gap-1.5">
              {relatedQuests.map((quest) => (
                <p key={quest.id} className="text-sm text-slate-300">
                  {quest.title} / 依頼ランク {getPriorityScore(quest)}
                </p>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-500">関連依頼はありません。</p>
          )}
        </section>

        <footer className="mt-5 grid gap-2 sm:grid-cols-4">
          <button type="button" onClick={onClose} disabled={disabled} className="quest-btn-secondary disabled:opacity-45">
            戻る
          </button>
          <button
            type="button"
            onClick={() => onCreateTask(event)}
            disabled={disabled}
            className="quest-btn-primary disabled:opacity-45"
          >
            任務を追加
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onEdit(event.id);
            }}
            disabled={disabled}
            className="quest-btn-ghost disabled:opacity-45"
          >
            編集
          </button>
          <button
            type="button"
            onClick={() => onDelete(event)}
            disabled={disabled}
            className="quest-btn-ghost border-red-400/70 text-red-200 disabled:opacity-45"
          >
            削除
          </button>
        </footer>
      </section>
    </div>
  );
}

function SettingsModal({
  open,
  currentName,
  disabled,
  onClose,
  onRename,
  onOpenGuide,
  onLogout,
}: {
  open: boolean;
  currentName: string;
  disabled: boolean;
  onClose: () => void;
  onRename: (name: string) => Promise<void>;
  onOpenGuide: () => void;
  onLogout: () => void;
}) {
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(currentName);
      setError(null);
      setSubmitting(false);
    }
  }, [open, currentName]);

  if (!open) return null;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextName = name.trim();
    if (!nextName) {
      setError("冒険者名を入力してください");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onRename(nextName);
      onClose();
    } catch {
      setError("冒険者名の変更に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[66] flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <button
        type="button"
        className="modal-backdrop absolute inset-0 bg-black/80"
        aria-label="設定を閉じる"
        onClick={disabled || submitting ? undefined : onClose}
      />
      <section className="modal-panel relative rpg-frame w-full max-w-md p-5">
        <header className="border-b-2 border-[var(--color-gold)]/30 pb-3">
          <h2 id="settings-title" className="pixel-window-title text-xl font-bold">
            設定
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            操作中の冒険者: {currentName || "未選択"}
          </p>
        </header>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <label className="block">
            <span className="block text-xs font-bold text-[var(--color-gold)] tracking-widest mb-2">
              冒険者名を変更
            </span>
            <input
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (error) setError(null);
              }}
              disabled={disabled || submitting}
              maxLength={24}
              className="quest-input"
              placeholder="例：リオ"
            />
          </label>
          {error && (
            <p className="border-2 border-red-400/55 bg-red-500/10 px-3 py-2 text-sm text-red-200 shadow-[3px_3px_0_#000]">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={disabled || submitting}
            className="quest-btn-primary w-full disabled:opacity-50"
          >
            名前を変更
          </button>
        </form>

        <div className="mt-5 border-t-2 border-[var(--color-gold)]/25 pt-4">
          <button
            type="button"
            onClick={onOpenGuide}
            disabled={disabled || submitting}
            className="quest-btn-ghost w-full disabled:opacity-50"
          >
            初回ガイドを見る
          </button>
          <button
            type="button"
            onClick={onLogout}
            disabled={disabled || submitting}
            className="quest-btn-ghost mt-2 w-full border-red-400/70 text-red-200 disabled:opacity-50"
          >
            ギルドから退出
          </button>
          <p className="mt-2 text-[10px] leading-5 text-slate-500">
            退出しても冒険者は名簿から削除されません。
          </p>
        </div>
      </section>
    </div>
  );
}

function QuickFilters({
  active,
  counts,
  onChange,
}: {
  active: QuickFilter | null;
  counts: Record<QuickFilter, number>;
  onChange: (filter: QuickFilter | null) => void;
}) {
  const filters: Array<{ id: QuickFilter; label: string }> = [
    { id: "open", label: "未受注" },
    { id: "recruiting", label: "募集中" },
    { id: "help_wanted", label: "助っ人募集" },
    { id: "in_progress", label: "挑戦中" },
    { id: "mine", label: "自分の依頼" },
    { id: "completed", label: "達成済み" },
  ];

  return (
    <div className="quick-filter-bar shrink-0 -mx-3 lg:-mx-0 px-3 lg:px-0 py-1 bg-[#17101a] border-y-2 border-[#fff4c4]/35">
      <div className="flex gap-1.5 overflow-x-auto custom-scroll" role="tablist" aria-label="クエスト絞り込み">
        <button
          type="button"
          aria-pressed={active == null}
          onClick={() => onChange(null)}
          className={`pixel-chip min-h-10 shrink-0 px-2 text-[10px] font-semibold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold-bright)] ${
            active == null
              ? "bg-[var(--color-gold-bright)] text-[#17101a]"
              : "bg-black/80 text-slate-300 hover:text-[var(--color-gold-bright)]"
          }`}
        >
          すべて
        </button>
        {filters.map((filter) => {
          const selected = active === filter.id;
          return (
            <button
              key={filter.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(selected ? null : filter.id)}
              className={`pixel-chip min-h-10 shrink-0 px-2 text-[10px] font-semibold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold-bright)] ${
                selected
                  ? "bg-[var(--color-gold-bright)] text-[#17101a]"
                  : "bg-black/80 text-slate-300 hover:text-[var(--color-gold-bright)]"
              }`}
            >
              {filter.label}
              <span className="ml-1.5 text-[10px] text-slate-400">
                {counts[filter.id]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RecommendedQuest({
  quest,
  selectedPlayer,
  staffByName,
  relatedEvent,
  linkedTask,
  busy,
  onAccept,
  onBecomeSuccessor,
  onRequestSuccession,
  onRequestComplete,
  onEdit,
  onRequestDelete,
  onOpenDetail,
}: {
  quest: Quest;
  selectedPlayer: string;
  staffByName: ReadonlyMap<string, PartyMember>;
  relatedEvent?: CalendarEvent | null;
  linkedTask?: AdventurerTask | null;
  busy: boolean;
  onAccept: (questId: number) => void;
  onBecomeSuccessor: (questId: number) => void;
  onRequestSuccession: (questId: number) => void;
  onRequestComplete: (questId: number) => void;
  onEdit: (questId: number) => void;
  onRequestDelete: (questId: number) => void;
  onOpenDetail: (questId: number) => void;
}) {
  const openSlots = Math.max(0, quest.requiredMembers - quest.participants.length);
  const reason =
    quest.status === "help_wanted"
      ? "助っ人を募集しています。空き枠があれば参加できます。"
      : quest.status === "open"
        ? "まだ誰も参加していません。対応可能なら参加できます。"
        : "参加者を募集中です。必要人員がそろうと挑戦中になります。";

  return (
    <section className="recommended-quest space-y-1.5 p-1.5" aria-label="おすすめクエスト">
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="min-w-0">
          <p className="font-[family-name:var(--font-display)] text-[10px] tracking-[0.2em] text-[var(--color-gold)]/70">
            NEXT QUEST
          </p>
          <h3 className="pixel-window-title text-sm font-bold">
            ギルド特別掲示
          </h3>
          <p className="hidden md:block truncate text-[11px] text-slate-500">{reason}</p>
        </div>
        <span className="pixel-chip hidden sm:inline-flex px-2 py-1 text-[10px] text-slate-300">
          空き枠 {openSlots}
        </span>
      </div>
      <QuestCard
        quest={quest}
        index={0}
        selectedPlayer={selectedPlayer}
        staffByName={staffByName}
        relatedEvent={relatedEvent}
        linkedTask={linkedTask}
        onAccept={onAccept}
        onBecomeSuccessor={onBecomeSuccessor}
        onRequestSuccession={onRequestSuccession}
        onRequestComplete={onRequestComplete}
        onEdit={onEdit}
        onRequestDelete={onRequestDelete}
        onOpenDetail={onOpenDetail}
        disabled={busy}
        featured
      />
    </section>
  );
}

function ToastStack({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed right-3 bottom-24 sm:bottom-auto sm:top-3 z-[80] flex w-[min(92vw,22rem)] flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast-enter rpg-frame px-4 py-3 text-sm ${
            toast.tone === "error"
              ? "border-red-400/80 bg-red-950/90 text-red-100"
              : toast.tone === "info"
                ? "border-[var(--color-mana)]/70 bg-[var(--color-abyss)] text-slate-100"
                : "border-[var(--color-gold-bright)] bg-[var(--color-abyss)] text-slate-100"
          }`}
        >
          <span className="mr-2 text-[var(--color-gold-bright)]">▶</span>
          {toast.message}
        </div>
      ))}
    </div>
  );
}

function RPGMessageWindow({
  message,
  onDismiss,
}: {
  message: DialogueMessage | null;
  onDismiss: () => void;
}) {
  if (!message) return null;

  return (
    <button
      type="button"
      className={`rpg-message-window rpg-message-${message.tone}`}
      aria-live="polite"
      aria-label={`${message.speaker}: ${message.message} メッセージを閉じる`}
      onClick={onDismiss}
    >
      <div className="rpg-message-speaker">[{message.speaker}]</div>
      <div className="rpg-message-copy">
        <p className="rpg-message-text">{message.message}</p>
        {message.lines && message.lines.length > 0 && (
          <div className="rpg-message-rewards">
            {message.lines.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </div>
        )}
      </div>
      <AvatarSprite
        avatarType={message.avatarType}
        fallback={message.icon}
        alt=""
        size="portrait"
        useFallbackWhenMissing
        className="rpg-message-avatar"
      />
      <span className="rpg-message-next" aria-hidden>
        ▼
      </span>
    </button>
  );
}

function GuideModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const items = [
    {
      title: "ギルドクエストとは",
      text: "ギルドクエストは、日々の作業を“任務”として管理し、必要に応じて仲間へ依頼できる職場用RPGツールです。仕事をただのタスクではなく、ギルドの依頼として楽しく共有できます。",
    },
    {
      title: "冒険者手帳",
      text: "冒険者手帳は、自分が持っている任務を記録する場所です。今日やること、今週やること、未来の作業を整理できます。基本的には、まずここに任務を記すところから始めます。",
    },
    {
      title: "任務を記す",
      text: "任務には、タイトル、説明、緊急度、重要度、納期、公開設定を登録できます。公開した任務は他の冒険者にも見えるようになります。非公開の任務は本人だけが確認できます。",
    },
    {
      title: "ギルド依頼",
      text: "自分だけでは対応が難しい任務は、ギルド依頼として掲示できます。掲示された依頼は、手が空いている冒険者が参加できます。",
    },
    {
      title: "依頼を出す2つの方法",
      text: "依頼の出し方は2つあります。基本は、冒険者手帳に記した任務を“ギルドへ依頼する”方法です。急ぎの場合は、ギルド依頼画面から直接依頼を掲示することもできます。直掲示した依頼も、自動的に任務として記録されます。",
    },
    {
      title: "参加・挑戦・助っ人募集",
      text: "依頼には必要人員が設定されています。必要人数に達するまでは参加者を募集します。定員に達すると挑戦中になります。挑戦者が助っ人募集を出すと、助っ人募集欄に表示され、他の冒険者が継承・参加できます。",
    },
    {
      title: "ギルド暦",
      text: "ギルド暦では、全体の予定と選択中の冒険者の任務を確認できます。予定は新商品発売、棚卸し、MTGなど全員が知るべき情報です。任務は個人の作業であり、公開設定によって表示範囲が変わります。",
    },
    {
      title: "ギルド速報",
      text: "ギルド速報には、期限が近い任務、届いた依頼、助言、ギルド指令、重要な予定などが表示されます。見落としを防ぐためのお知らせ欄です。",
    },
    {
      title: "自分の依頼",
      text: "自分の依頼では、自分が参加している依頼や挑戦中の依頼を確認できます。まずはここで、自分が今やるべき依頼を確認してください。",
    },
    {
      title: "遠征",
      text: "遠征は放置型の育成要素です。依頼を達成すると遠征チケットを獲得できます。遠征に出すと、時間経過後にEXPやGOLDなどの報酬を受け取れます。",
    },
    {
      title: "冒険者パーティ",
      text: "冒険者パーティでは、登録されているメンバーを確認できます。右側のパーティ欄で選択した冒険者に応じて、本日の任務やギルド暦の表示内容が変わります。",
    },
    {
      title: "EXP・Lv・報酬",
      text: "依頼を達成するとEXPを獲得し、Lvが上がります。達成や遠征を通じて、自分の冒険者を育てることができます。",
    },
    {
      title: "基本のおすすめ運用",
      text: "まずは冒険者手帳に任務を記します。自分でできるものは自分で進め、誰かに手伝ってほしいものはギルド依頼へ掲示します。完了したら討伐完了として記録し、報酬を受け取りましょう。",
    },
  ];
  const activeItem = items[activeIndex] ?? items[0];

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[75] flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="guide-title"
    >
      <button
        type="button"
        className="modal-backdrop absolute inset-0 bg-black/80"
        aria-label="初回ガイドを閉じる"
        onClick={onClose}
      />
      <div className="modal-panel relative rpg-frame max-h-[calc(100dvh-32px)] w-full max-w-4xl overflow-y-auto custom-scroll p-5 pb-[calc(env(safe-area-inset-bottom)+20px)]">
        <p className="font-[family-name:var(--font-display)] text-[10px] tracking-[0.22em] text-[var(--color-gold)]/80">
          GUILD GUIDE
        </p>
        <h2 id="guide-title" className="pixel-window-title mt-1 text-xl font-bold">
          ギルドクエストの使い方
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          冒険者手帳、ギルド依頼、ギルド暦、遠征までの基本運用をまとめています。
        </p>

        <div className="mt-4 hidden min-h-0 grid-cols-[15rem_minmax(0,1fr)] gap-3 md:grid">
          <nav className="max-h-[58dvh] overflow-y-auto custom-scroll pr-1">
            <div className="grid gap-1">
              {items.map((item, index) => (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  className={`pixel-menu-button min-h-10 px-2 py-2 text-left text-xs ${
                    index === activeIndex ? "is-selected" : ""
                  }`}
                >
                  <span className="mr-2 text-[var(--color-gold-bright)]">
                    {index + 1}
                  </span>
                  {item.title}
                </button>
              ))}
            </div>
          </nav>
          <section className="min-h-[18rem] border-2 border-white/20 bg-black/22 p-4 shadow-[3px_3px_0_#000]">
            <p className="font-[family-name:var(--font-display)] text-[10px] tracking-[0.2em] text-[var(--color-gold)]/70">
              GUIDE {activeIndex + 1}
            </p>
            <h3 className="mt-2 text-lg font-semibold text-[var(--color-gold-bright)]">
              {activeItem.title}
            </h3>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              {activeItem.text}
            </p>
          </section>
        </div>

        <div className="mt-4 space-y-2 md:hidden">
          {items.map((item, index) => (
            <details
              key={item.title}
              className="border-2 border-white/20 bg-black/22 p-3 shadow-[2px_2px_0_#000]"
              open={index === 0}
            >
              <summary className="cursor-pointer text-sm font-semibold text-slate-100">
                <span className="mr-2 text-[var(--color-gold-bright)]">
                  {index + 1}
                </span>
                {item.title}
              </summary>
              <p className="mt-2 text-xs leading-6 text-slate-400">
                {item.text}
              </p>
            </details>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="quest-btn-primary mt-5 w-full"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}

function CompletionBurst({ reward }: { reward: CompletionReward }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-[70] flex justify-center px-4">
      <div className="completion-burst reward-panel reward-window rpg-frame relative overflow-hidden border-[var(--color-xp)]/80 bg-[var(--color-abyss)] px-6 py-5 text-center">
        <div className="reward-sparkles" aria-hidden>
          {[...Array(14)].map((_, i) => (
            <span key={i} style={{ "--i": i } as CSSProperties} />
          ))}
        </div>
        <p className="pixel-title text-2xl font-bold text-[var(--color-xp)]">
          クエスト達成！
        </p>
        <p className="mt-1 max-w-[18rem] truncate text-xs text-slate-300">
          {reward.title}
        </p>
        <div className="mt-4 grid gap-2 text-sm font-bold">
          <span className="reward-row">
            EXP +{reward.exp}
          </span>
          <span className="reward-row">
            GOLD +{reward.coins}
          </span>
          <span className="reward-row">
            ギルドEXP +{reward.guildExp}
          </span>
          {reward.tickets != null && reward.tickets > 0 && (
            <span className="reward-row">
              遠征チケット +{reward.tickets}
            </span>
          )}
        </div>
        <p className="mt-4 pixel-chip inline-flex px-4 py-1 text-xs text-slate-300">
          OK
        </p>
      </div>
    </div>
  );
}

function ConfigError() {
  return (
    <div className="quest-bg min-h-dvh flex items-center justify-center p-6">
      <div className="rpg-frame p-8 max-w-md text-center">
        <span className="text-4xl">⚠️</span>
        <h1 className="mt-4 text-xl font-bold gold-text">
          Supabase設定が未完了です
        </h1>
        <p className="text-sm text-slate-400 mt-3 leading-relaxed">
          <code className="text-[var(--color-gold)]">.env.example</code> を{" "}
          <code className="text-[var(--color-gold)]">.env</code> にコピーし、
          Supabase接続情報を設定してください。
        </p>
        <p className="text-xs text-slate-500 mt-4">
          <code>supabase/migrations/</code> のマイグレーションを実行し、
          開発サーバーを再起動してください。
        </p>
      </div>
    </div>
  );
}

function LoadingBoard() {
  return (
    <div className="min-h-0 flex-1 overflow-hidden flex flex-col gap-2 pb-20 lg:pb-1">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="quest-card p-4 h-40 overflow-hidden"
        >
          <div className="h-4 w-24 bg-black/10 animate-pulse" />
          <div className="mt-4 h-5 w-3/4 bg-black/10 animate-pulse" />
          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="h-8 bg-black/10 animate-pulse" />
            <div className="h-8 bg-black/10 animate-pulse" />
            <div className="h-8 bg-black/10 animate-pulse" />
          </div>
          <div className="mt-4 h-10 bg-black/10 animate-pulse" />
        </div>
      ))}
      <p className="text-center text-xs text-slate-500">クエストを読み込み中です…</p>
    </div>
  );
}

function EmptyState({
  nav,
  filter,
}: {
  nav: NavId;
  filter?: QuickFilter | null;
}) {
  const title =
    filter === "open"
        ? "現在、参加可能な依頼はありません"
        : filter === "recruiting"
          ? "募集中の依頼はありません"
        : filter === "help_wanted"
          ? "助っ人募集はありません"
        : filter === "in_progress"
          ? "挑戦中の依頼はありません"
          : filter === "mine"
            ? "自分の依頼はありません"
            : nav === "my"
              ? "担当中のクエストはありません"
              : "ギルドは平穏です";
  const message =
    filter === "open"
        ? "まだ誰も参加していない依頼はありません。手帳の任務から依頼書化できます。"
        : filter === "recruiting"
          ? "参加者が集まり始めている依頼はありません。"
        : filter === "help_wanted"
          ? "現在、助っ人を募集しているクエストはありません。"
        : filter === "in_progress"
          ? "定員に達して進行中の依頼はありません。"
        : filter === "mine"
            ? "対応できる依頼があれば、参加して進行できます。"
            : nav === "my"
              ? "ギルド依頼に参加するとここに表示されます。"
              : "必要な作業は冒険者手帳に記し、必要に応じてギルドへ依頼できます。";

  return (
    <div className="rpg-frame p-5 text-center">
      <span className="text-4xl">📜</span>
      <p className="mt-4 text-lg font-bold gold-text">
        {title}
      </p>
      <p className="text-sm text-slate-500 mt-2">
        {message}
      </p>
    </div>
  );
}

function CalendarPanel({
  events,
  quests,
  tasks,
  selectedPlayer,
  ownPlayerName,
  loading,
  monthDate,
  selectedDate,
  onMonthChange,
  onSelectedDateChange,
  onCreate,
  onCreateTask,
  onEdit,
  onOpenDetail,
  busy,
}: {
  events: CalendarEvent[];
  quests: Quest[];
  tasks: AdventurerTask[];
  selectedPlayer: string;
  ownPlayerName: string;
  loading: boolean;
  monthDate: Date;
  selectedDate: string;
  onMonthChange: (date: Date) => void;
  onSelectedDateChange: (date: string) => void;
  onCreate: (date: string) => void;
  onCreateTask: (date: string) => void;
  onEdit: (eventId: number) => void;
  onOpenDetail: (eventId: number) => void;
  busy: boolean;
}) {
  const monthGrid = getMonthGrid(monthDate);
  const visibleEvents = useMemo(
    () => events.filter(isGuildWideCalendarEvent),
    [events],
  );
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of visibleEvents) {
      const list = map.get(event.eventDate) ?? [];
      list.push(event);
      map.set(event.eventDate, list);
    }
    for (const list of map.values()) {
      list.sort(compareCalendarEvents);
    }
    return map;
  }, [visibleEvents]);
  const selectedTaskOwner = selectedPlayer || ownPlayerName || "";
  const viewingOwnCalendarTasks = selectedTaskOwner === ownPlayerName;
  const visibleCalendarTasks = useMemo(
    () => filterVisibleCalendarTasks(tasks, selectedTaskOwner, ownPlayerName),
    [ownPlayerName, selectedTaskOwner, tasks],
  );
  const tasksByDate = useMemo(() => {
    const map = new Map<string, AdventurerTask[]>();
    for (const task of visibleCalendarTasks) {
      if (!task.dueDate) continue;
      const list = map.get(task.dueDate) ?? [];
      list.push(task);
      map.set(task.dueDate, list);
    }
    for (const list of map.values()) {
      list.sort(compareCalendarTasks);
    }
    return map;
  }, [visibleCalendarTasks]);
  const selectedEvents = eventsByDate.get(selectedDate) ?? [];
  const selectedTasks = tasksByDate.get(selectedDate) ?? [];
  const weekRange = getWeekRange(new Date());
  const weekEvents = visibleEvents
    .filter((event) => isDateWithinRange(event.eventDate, weekRange.start, weekRange.end))
    .sort(compareCalendarEvents);
  const weekTasks = visibleCalendarTasks
    .filter((task) =>
      task.dueDate
        ? isDateWithinRange(task.dueDate, weekRange.start, weekRange.end)
        : false,
    )
    .sort(compareCalendarTasks);
  const taskSectionTitle = viewingOwnCalendarTasks
    ? "自分の任務"
    : `${selectedTaskOwner || "冒険者"}の公開任務`;
  const taskSectionSubtitle = viewingOwnCalendarTasks
    ? "非公開任務も本人には表示"
    : "公開設定の任務だけ表示";
  const emptyTaskText = viewingOwnCalendarTasks
    ? "この日の自分の任務はありません。"
    : "この日の公開任務はありません。";
  const emptyWeekTaskText = viewingOwnCalendarTasks
    ? "今週の自分の任務はありません。"
    : "今週の公開任務はありません。";

  const moveMonth = (offset: number) => {
    onMonthChange(new Date(monthDate.getFullYear(), monthDate.getMonth() + offset, 1));
  };

  const goToday = () => {
    const today = new Date();
    onMonthChange(today);
    onSelectedDateChange(toDateInputValue(today));
  };

  return (
    <div
      className={`min-h-0 flex-1 overflow-y-auto custom-scroll space-y-3 pb-20 lg:pb-1 pr-1 ${busy ? "opacity-80 pointer-events-none" : ""}`}
    >
      <section className="rpg-frame calendar-board p-3 sm:p-4">
        <header className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-gold)]/20 pb-3">
          <div>
            <p className="font-[family-name:var(--font-display)] text-[10px] tracking-[0.22em] text-[var(--color-gold)]/80">
              GUILD CALENDAR
            </p>
            <h3 className="pixel-window-title mt-1 text-base font-semibold">
              ギルド暦
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => moveMonth(-1)} className="quest-btn-ghost min-h-10 px-2 text-[11px]">
              前月
            </button>
            <button type="button" onClick={goToday} className="quest-btn-ghost min-h-10 px-2 text-[11px]">
              今日へ
            </button>
            <button type="button" onClick={() => moveMonth(1)} className="quest-btn-ghost min-h-10 px-2 text-[11px]">
              次月
            </button>
            <button type="button" onClick={() => onCreate(selectedDate)} className="quest-btn-primary min-h-10 px-2 text-[11px]">
              予定を追加
            </button>
            <button type="button" onClick={() => onCreateTask(selectedDate)} className="quest-btn-ghost min-h-10 px-2 text-[11px]">
              任務を追加
            </button>
          </div>
        </header>

        <div className="mb-2 flex items-center justify-between gap-2">
          <h4 className="pixel-title text-lg text-[var(--color-gold-bright)]">
            {formatCalendarMonth(monthDate)}
          </h4>
          <p className="text-xs text-slate-500">
            {loading
              ? "読み込み中..."
              : `全体予定 ${visibleEvents.length}件 / ${selectedTaskOwner || "選択中"}の任務 ${visibleCalendarTasks.length}件`}
          </p>
        </div>

        <div className="calendar-weekdays grid grid-cols-7 gap-1 text-center text-[10px] text-[var(--color-gold)]">
          {["日", "月", "火", "水", "木", "金", "土"].map((day) => (
            <span key={day} className="py-1">{day}</span>
          ))}
        </div>
        <div className="calendar-month-grid mt-1 grid grid-cols-7 gap-1">
          {monthGrid.map((cell) => {
            const dayEvents = eventsByDate.get(cell.dateKey) ?? [];
            const dayTasks = tasksByDate.get(cell.dateKey) ?? [];
            const hasHighImportance =
              dayEvents.some((event) => event.importance >= 4) ||
              dayTasks.some((task) => task.importance >= 4);
            const isSelected = selectedDate === cell.dateKey;
            const totalCount = dayEvents.length + dayTasks.length;
            return (
              <button
                key={cell.dateKey}
                type="button"
                onClick={() => onSelectedDateChange(cell.dateKey)}
                className={`calendar-day-cell ${cell.inMonth ? "" : "is-muted"} ${cell.isToday ? "is-today" : ""} ${isSelected ? "is-selected" : ""} ${hasHighImportance ? "has-important" : ""}`}
              >
                <span className="calendar-day-number">{cell.date.getDate()}</span>
                {totalCount > 0 && (
                  <span className="calendar-day-count">{totalCount}件</span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid min-h-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.7fr)]">
        <section className="rpg-frame min-h-0 p-3 sm:p-4">
          <header className="mb-3 flex items-center justify-between gap-2 border-b border-[var(--color-gold)]/20 pb-3">
            <div>
              <h3 className="pixel-window-title text-sm font-semibold">
                {formatCalendarDate(selectedDate)}
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                予定と任務を分けて確認します
              </p>
            </div>
            <button
              type="button"
              onClick={() => onCreateTask(selectedDate)}
              className="quest-btn-ghost min-h-11 px-3 text-xs"
            >
              任務を追加
            </button>
          </header>
          <div className="grid gap-3">
            <CalendarSection title="ギルド予定" subtitle="全員共有の予定">
              <EventList
                events={selectedEvents}
                quests={quests}
                tasks={visibleCalendarTasks}
                emptyText="この日のギルド予定はありません。"
                onEdit={onEdit}
                onOpenDetail={onOpenDetail}
              />
            </CalendarSection>
            <CalendarSection title={taskSectionTitle} subtitle={taskSectionSubtitle}>
              <TaskCalendarList
                tasks={selectedTasks}
                emptyText={emptyTaskText}
                mine={viewingOwnCalendarTasks}
              />
            </CalendarSection>
          </div>
        </section>

        <section className="rpg-frame min-h-0 p-3 sm:p-4">
          <header className="mb-3 border-b border-[var(--color-gold)]/20 pb-3">
            <h3 className="pixel-window-title text-sm font-semibold">
              今週の予定と任務
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              今日から7日間 / 任務は選択中冒険者だけを表示します
            </p>
          </header>
          <div className="grid gap-3">
            <CalendarSection title="ギルド予定" subtitle="全員共有">
              <EventList
                events={weekEvents}
                quests={quests}
                tasks={visibleCalendarTasks}
                emptyText="今週のギルド予定はありません。"
                onEdit={onEdit}
                onOpenDetail={onOpenDetail}
                compact
              />
            </CalendarSection>
            <CalendarSection title={taskSectionTitle} subtitle={taskSectionSubtitle}>
              <TaskCalendarList
                tasks={weekTasks}
                emptyText={emptyWeekTaskText}
                compact
                mine={viewingOwnCalendarTasks}
              />
            </CalendarSection>
          </div>
        </section>
      </div>
    </div>
  );
}

function CalendarSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="calendar-separated-section border-2 border-white/15 bg-black/18 p-3 shadow-[3px_3px_0_#000]">
      <header className="mb-2 flex items-center justify-between gap-2 border-b border-white/10 pb-2">
        <h4 className="pixel-title text-sm text-[var(--color-gold-bright)]">
          {title}
        </h4>
        <span className="text-[10px] text-slate-500">{subtitle}</span>
      </header>
      {children}
    </section>
  );
}

function TaskCalendarList({
  tasks,
  emptyText,
  compact = false,
  mine = false,
}: {
  tasks: AdventurerTask[];
  emptyText: string;
  compact?: boolean;
  mine?: boolean;
}) {
  if (tasks.length === 0) {
    return <p className="py-3 text-center text-sm text-slate-500">{emptyText}</p>;
  }

  return (
    <div className="grid gap-2">
      {tasks.map((task) => (
        <CalendarTaskCard
          key={task.id}
          task={task}
          compact={compact}
          mine={mine}
        />
      ))}
    </div>
  );
}

function CalendarTaskCard({
  task,
  compact,
  mine,
}: {
  task: AdventurerTask;
  compact: boolean;
  mine: boolean;
}) {
  const dueTone = getTaskDueTone(task);
  const overdue = dueTone === "overdue";
  return (
    <article
      className={`calendar-task-card ${mine ? "is-mine" : "is-public"} ${
        overdue ? "is-overdue" : ""
      } ${compact ? "is-compact" : ""} p-3`}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-1">
            <span className={`calendar-tag ${mine ? "is-mine" : "is-task"}`}>
              {mine ? "自分" : "任務"}
            </span>
            <span className="calendar-tag">緊急{task.priority}</span>
            <span className="calendar-tag">重要{task.importance}</span>
            {overdue && <span className="calendar-tag is-danger">期限超過</span>}
            {task.isPublic && <span className="calendar-tag">公開</span>}
          </div>
          <h4 className="mt-2 truncate pixel-title text-sm text-slate-100">
            {task.ownerName}: {task.title}
          </h4>
          <p className="mt-1 text-[11px] text-slate-500">
            納期 {task.dueDate ? task.dueDate.replaceAll("-", "/") : "未定"} / {TASK_STATUS_LABELS[task.status]}
          </p>
        </div>
      </div>
      {!compact && task.description && (
        <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">
          {task.description}
        </p>
      )}
    </article>
  );
}

function EventList({
  events,
  quests,
  tasks = [],
  emptyText,
  onEdit,
  onOpenDetail,
  compact = false,
}: {
  events: CalendarEvent[];
  quests: Quest[];
  tasks?: AdventurerTask[];
  emptyText: string;
  onEdit: (eventId: number) => void;
  onOpenDetail: (eventId: number) => void;
  compact?: boolean;
}) {
  if (events.length === 0) {
    return <p className="py-4 text-center text-sm text-slate-500">{emptyText}</p>;
  }

  return (
    <div className="grid gap-2">
      {events.map((event) => (
        <CalendarEventCard
          key={event.id}
          event={event}
          relatedQuests={getRelatedQuestsForEvent(event, quests)}
          relatedTasks={getRelatedTasksForEvent(event, tasks)}
          onEdit={() => onEdit(event.id)}
          onOpenDetail={() => onOpenDetail(event.id)}
          compact={compact}
        />
      ))}
    </div>
  );
}

function CalendarEventCard({
  event,
  relatedQuests,
  relatedTasks,
  onEdit,
  onOpenDetail,
  compact = false,
}: {
  event: CalendarEvent;
  relatedQuests: Quest[];
  relatedTasks: AdventurerTask[];
  onEdit: () => void;
  onOpenDetail: () => void;
  compact?: boolean;
}) {
  const deadlinePast = isPastDeadline(event);
  const days = daysUntil(event.eventDate);

  return (
    <article
      className={`calendar-event-card ${EVENT_TYPE_TONES[event.eventType]} importance-${event.importance} ${deadlinePast ? "is-overdue" : ""} p-3`}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-1">
            <span className="calendar-tag is-event">予定</span>
            <span className="calendar-tag">{EVENT_TYPE_LABELS[event.eventType]}</span>
            <span className="calendar-tag">重要度{event.importance}</span>
            {deadlinePast && <span className="calendar-tag is-danger">期限超過</span>}
            {event.eventType === "deadline" && !deadlinePast && days <= 3 && (
              <span className="calendar-tag is-danger">期限まで{days}日</span>
            )}
          </div>
          <h4 className="mt-2 truncate pixel-title text-sm text-slate-100">
            {event.title}
          </h4>
          <p className="mt-1 text-[11px] text-slate-500">
            {formatCalendarDate(event.eventDate)} / {formatEventTime(event)}
            {event.ownerName ? ` / ${event.ownerName}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <button type="button" onClick={onOpenDetail} className="quest-btn-ghost min-h-11 px-2 text-[10px]">
            詳細
          </button>
          {!compact && (
            <button type="button" onClick={onEdit} className="quest-btn-ghost min-h-11 px-2 text-[10px]">
              編集
            </button>
          )}
        </div>
      </div>
      {!compact && event.description && (
        <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">
          {event.description}
        </p>
      )}
      {relatedQuests.length > 0 && (
        <p className="mt-2 text-[11px] text-[var(--color-gold-bright)]">
          関連依頼: {relatedQuests.map((quest) => quest.title).join(" / ")}
        </p>
      )}
      {relatedTasks.length > 0 && (
        <p className="mt-2 text-[11px] text-[#9ff0af]">
          関連任務:{" "}
          {relatedTasks.map((task) => `${task.ownerName}: ${task.title}`).join(" / ")}
        </p>
      )}
    </article>
  );
}

function compareCalendarEvents(a: CalendarEvent, b: CalendarEvent) {
  const byDate = a.eventDate.localeCompare(b.eventDate);
  if (byDate !== 0) return byDate;
  const byTime = (a.startTime || "99:99").localeCompare(b.startTime || "99:99");
  if (byTime !== 0) return byTime;
  return b.importance - a.importance;
}

function compareCalendarTasks(a: AdventurerTask, b: AdventurerTask) {
  const byDate = (a.dueDate ?? "9999-12-31").localeCompare(
    b.dueDate ?? "9999-12-31",
  );
  if (byDate !== 0) return byDate;
  const byUrgency = b.priority - a.priority;
  if (byUrgency !== 0) return byUrgency;
  const byImportance = b.importance - a.importance;
  if (byImportance !== 0) return byImportance;
  return b.updatedAt.localeCompare(a.updatedAt);
}

function filterVisibleCalendarTasks(
  tasks: AdventurerTask[],
  selectedPlayer: string,
  ownPlayerName: string,
) {
  return tasks.filter((task) => {
    if (!task.dueDate) return false;
    if (task.ownerName !== selectedPlayer) return false;
    return selectedPlayer === ownPlayerName || task.isPublic;
  });
}

function isGuildWideCalendarEvent(event: CalendarEvent) {
  return event.eventType !== "personal";
}

function sortMyPageQuests(quests: Quest[]): Quest[] {
  const statusPriority: Record<Quest["status"], number> = {
    in_progress: 0,
    help_wanted: 1,
    recruiting: 2,
    open: 3,
    completed: 4,
  };

  return [...quests].sort((a, b) => {
    const byStatus = statusPriority[a.status] - statusPriority[b.status];
    if (byStatus !== 0) return byStatus;
    const byScore = getPriorityScore(b) - getPriorityScore(a);
    if (byScore !== 0) return byScore;
    return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
  });
}

function getRelatedQuestsForEvent(event: CalendarEvent, quests: Quest[]) {
  return quests.filter(
    (quest) =>
      quest.linkedEventId === event.id ||
      (event.linkedQuestId != null && quest.id === event.linkedQuestId),
  );
}

function getRelatedTasksForEvent(
  event: CalendarEvent,
  tasks: AdventurerTask[],
) {
  return tasks.filter((task) => task.calendarEventId === event.id);
}

function ExpeditionPanel({
  selectedMember,
  resources,
  expeditions,
  currentExpedition,
  loading,
  now,
  busy,
  compact = false,
  onStart,
  onClaim,
  onGrowthAction,
}: {
  selectedMember: PartyMember | null;
  resources: PlayerResources;
  expeditions: Expedition[];
  currentExpedition: Expedition | null;
  loading: boolean;
  now: number;
  busy: boolean;
  compact?: boolean;
  onStart: (destination: ExpeditionDestination) => void;
  onClaim: (expedition: Expedition) => void;
  onGrowthAction: (action: GrowthAction) => void;
}) {
  const ready = currentExpedition
    ? isExpeditionReady(currentExpedition, now)
    : false;
  const remainingMs = currentExpedition
    ? new Date(currentExpedition.endsAt).getTime() - now
    : 0;
  const claimedHistory = expeditions.filter((expedition) => expedition.status === "claimed");
  const itemEntries = Object.entries(resources.items).filter(([, amount]) => amount > 0);
  const playerLevel = selectedMember?.level ?? 1;

  if (loading) {
    return (
      <div className={compact ? "mb-2 space-y-2 lg:hidden" : "min-h-0 flex-1 space-y-3"}>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rpg-frame h-[72px] animate-pulse bg-white/5"
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={
        compact
          ? "mb-2 space-y-2 lg:hidden"
          : "min-h-0 flex-1 overflow-y-auto custom-scroll space-y-3 pb-20 lg:pb-1 pr-1"
      }
    >
      <section className="rpg-frame expedition-status-panel p-3 sm:p-4">
        <header className="mb-3 flex items-start justify-between gap-3 border-b border-[var(--color-gold)]/20 pb-3">
          <div className="min-w-0">
            <p className="font-[family-name:var(--font-display)] text-[10px] tracking-[0.22em] text-[var(--color-gold)]/80">
              EXPEDITION
            </p>
            <h3 className="pixel-window-title mt-1 text-base font-semibold">
              遠征
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              クエスト達成で得た遠征チケットを使い、時間経過で報酬を受け取れます。
            </p>
          </div>
          <div className="grid shrink-0 grid-cols-2 gap-2 text-center">
            <div className="pixel-chip px-2 py-1 text-[10px] text-[var(--color-gold-bright)]">
              <span className="block text-slate-500">チケット</span>
              <strong className="text-base">{resources.expeditionTickets}</strong>
            </div>
            <div className="pixel-chip px-2 py-1 text-[10px] text-[var(--color-gold-bright)]">
              <span className="block text-slate-500">GOLD</span>
              <strong className="text-base">{resources.gold}</strong>
            </div>
          </div>
        </header>

        <GrowthStatusPanel
          selectedMember={selectedMember}
          resources={resources}
          busy={busy}
          onGrowthAction={onGrowthAction}
        />

        <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(12rem,0.45fr)]">
          <div className="expedition-current-window border-2 border-white/15 bg-black/25 p-3 shadow-[3px_3px_0_#000]">
            <p className="quest-pixel-label text-[10px] text-[var(--color-gold)]">
              現在の遠征状態
            </p>
            {currentExpedition ? (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="pixel-title text-base text-slate-100">
                    {currentExpedition.expeditionName}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {ready
                      ? "帰還可能です。報酬を受け取れます。"
                      : `帰還まで ${formatRemainingTime(remainingMs)}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onClaim(currentExpedition)}
                  disabled={!ready || busy}
                  className="quest-btn-primary min-h-11 px-3 text-xs disabled:opacity-45"
                >
                  {ready ? "報酬を受け取る" : "遠征中"}
                </button>
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-400">
                待機中です。遠征先を選んで出発できます。
              </p>
            )}
          </div>

          <div className="border-2 border-white/15 bg-black/20 p-3 shadow-[3px_3px_0_#000]">
            <p className="quest-pixel-label text-[10px] text-[var(--color-gold)]">
              所持アイテム
            </p>
            {itemEntries.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {itemEntries.map(([name, amount]) => (
                  <span key={name} className="pixel-chip px-2 py-1 text-[10px] text-slate-300">
                    {name} x{amount}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-500">まだアイテムはありません。</p>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-2 lg:grid-cols-3">
        {EXPEDITION_DESTINATIONS.map((destination) => {
          const shortage = resources.expeditionTickets < destination.ticketCost;
          const successBreakdown = calculateExpeditionSuccessRate(
            destination,
            resources,
            playerLevel,
          );
          const trustBlocked = resources.trust < destination.requiredTrust;
          const fatigueBlocked = resources.fatigue >= 90;
          const equipmentBlocked = resources.equipmentDurability <= 5;
          const blockedReason = fatigueBlocked
            ? "疲労限界"
            : equipmentBlocked
              ? "装備整備が必要"
              : trustBlocked
                ? "信頼度不足"
                : "";
          const disabled =
            busy ||
            currentExpedition != null ||
            shortage ||
            trustBlocked ||
            fatigueBlocked ||
            equipmentBlocked;
          const rewardLines = [
            `成功 EXP +${destination.rewardExp} / GOLD +${destination.rewardGold}`,
            `失敗 EXP +${destination.failureRewardExp} / GOLD +${destination.failureRewardGold}`,
            ...formatRewardMaterialTable(destination.rewardMaterials),
            destination.rareMaterial ? `${destination.rareMaterial.name} 入手の可能性` : "",
          ].filter(Boolean);

          return (
            <article
              key={destination.key}
              className="rpg-frame expedition-destination-card p-3"
            >
              <div className="flex items-start gap-3">
                <div className="expedition-icon" aria-hidden>
                  {destination.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="pixel-title text-base text-slate-100">
                    {destination.name}
                  </h4>
                  <p className="mt-1 text-[11px] leading-5 text-slate-500">
                    {destination.description}
                  </p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
                <span className="pixel-chip px-2 py-1 text-slate-300">
                  所要 {destination.durationMinutes}分
                </span>
                <span className="pixel-chip px-2 py-1 text-[var(--color-gold-bright)]">
                  チケット {destination.ticketCost}
                </span>
                <span className="pixel-chip px-2 py-1 text-[var(--color-xp)]">
                  成功率 {successBreakdown.total}%
                </span>
                <span className="pixel-chip px-2 py-1 text-slate-300">
                  信頼 {resources.trust}/{destination.requiredTrust}
                </span>
              </div>
              <SuccessRateBreakdownList breakdown={successBreakdown} />
              <div className="mt-3 grid gap-1 text-[11px] text-slate-300">
                {rewardLines.map((line) => (
                  <span key={line} className="reward-row">
                    {line}
                  </span>
                ))}
              </div>
              <button
                type="button"
                onClick={() => onStart(destination)}
                disabled={disabled}
                className="quest-btn-primary mt-3 w-full text-xs disabled:opacity-45"
              >
                {currentExpedition
                  ? "遠征中"
                  : shortage
                    ? "チケット不足"
                    : blockedReason || "出発"}
              </button>
            </article>
          );
        })}
      </section>

      {!compact && claimedHistory.length > 0 && (
        <section className="rpg-frame p-3">
          <h3 className="pixel-window-title text-sm font-semibold">
            最近の帰還
          </h3>
          <div className="mt-2 grid gap-1.5">
            {claimedHistory.slice(0, 3).map((expedition) => (
              <p
                key={expedition.id}
                className="border-2 border-white/15 bg-black/20 px-2 py-2 text-xs text-slate-400 shadow-[2px_2px_0_#000]"
              >
                {expedition.result === "success"
                  ? "成功"
                  : expedition.result === "failure"
                    ? "失敗"
                    : "帰還"}{" "}
                / {expedition.expeditionName} / EXP +{expedition.rewardExp} /
                GOLD +{expedition.rewardGold}
              </p>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function GrowthStatusPanel({
  selectedMember,
  resources,
  busy,
  onGrowthAction,
}: {
  selectedMember: PartyMember | null;
  resources: PlayerResources;
  busy: boolean;
  onGrowthAction: (action: GrowthAction) => void;
}) {
  const equipment = getEquipment(resources.equipmentKey);
  const job = getJobClass(resources.jobClass);
  const expProgress = selectedMember ? selectedMember.exp % 100 : 0;
  const actions: GrowthAction[] = [
    "train_proficiency",
    "rest_tavern",
    "guild_meeting",
    "maintain_equipment",
  ];

  return (
    <section className="mb-3 border-2 border-[var(--color-gold)]/35 bg-black/25 p-3 shadow-[3px_3px_0_#000]">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="flex min-w-0 items-center gap-3">
          {selectedMember ? (
            <AvatarSprite
              avatarType={selectedMember.avatarType}
              frame={selectedMember.avatarFrame}
              size="md"
            />
          ) : (
            <div className="h-14 w-14 border-2 border-white/20 bg-black/30" />
          )}
          <div className="min-w-0 flex-1">
            <p className="quest-pixel-label text-[10px] text-[var(--color-gold)]">
              冒険者育成
            </p>
            <h4 className="pixel-title truncate text-base text-slate-100">
              {(selectedMember?.name ?? resources.playerName) || "冒険者"}
            </h4>
            <p className="mt-1 text-xs text-slate-400">
              Lv.{selectedMember?.level ?? 1} / {job.label} / {equipment.label}
            </p>
            <div className="mt-2 h-2 border border-white/20 bg-black/45">
              <div
                className="h-full bg-[var(--color-xp)]"
                style={{ width: `${expProgress}%` }}
              />
            </div>
            <p className="mt-1 text-[10px] text-slate-500">
              EXP {selectedMember?.exp ?? 0} / 次Lvまで {100 - expProgress}
            </p>
          </div>
        </div>

        <div className="grid gap-2">
          <div className="grid gap-1.5 sm:grid-cols-2">
            <GrowthGauge label="士気" value={resources.morale} tone="gold" />
            <GrowthGauge label="疲労" value={resources.fatigue} tone="red" />
            <GrowthGauge label="熟練" value={resources.proficiency} tone="blue" />
            <GrowthGauge label="信頼" value={resources.trust} tone="green" />
            <GrowthGauge
              label="耐久"
              value={resources.equipmentDurability}
              tone="gold"
            />
            <div className="pixel-chip px-2 py-1 text-[10px] text-slate-300">
              成功 {resources.totalExpeditionSuccess} / 失敗{" "}
              {resources.totalExpeditionFailure}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {actions.map((action) => (
              <button
                key={action}
                type="button"
                onClick={() => onGrowthAction(action)}
                disabled={busy}
                className="quest-btn-secondary min-h-10 px-2 text-[10px] disabled:opacity-45"
              >
                {GROWTH_ACTION_LABELS[action]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function GrowthGauge({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "gold" | "red" | "blue" | "green";
}) {
  const filled = Math.round(clampGaugeValue(value) / 20);
  const color =
    tone === "red"
      ? "text-red-300"
      : tone === "blue"
        ? "text-sky-300"
        : tone === "green"
          ? "text-emerald-300"
          : "text-[var(--color-gold-bright)]";

  return (
    <div className="pixel-chip flex items-center justify-between gap-2 px-2 py-1 text-[10px]">
      <span className="shrink-0 text-slate-400">{label}</span>
      <span className={`font-bold ${color}`} aria-label={`${label} ${value}`}>
        {Array.from({ length: 5 }, (_, index) =>
          index < filled ? "◆" : "◇",
        ).join("")}
      </span>
      <span className="w-6 text-right text-slate-500">{value}</span>
    </div>
  );
}

function SuccessRateBreakdownList({
  breakdown,
}: {
  breakdown: ReturnType<typeof calculateExpeditionSuccessRate>;
}) {
  const rows = [
    `基礎 ${breakdown.base}%`,
    `Lv +${breakdown.levelBonus}`,
    `士気 ${formatSigned(breakdown.moraleBonus)}`,
    `熟練 +${breakdown.proficiencyBonus}`,
    `装備 +${breakdown.equipmentBonus}`,
    `職業 +${breakdown.jobBonus}`,
    `疲労 -${breakdown.fatiguePenalty}`,
    breakdown.durabilityPenalty > 0
      ? `耐久 -${breakdown.durabilityPenalty}`
      : "",
  ].filter(Boolean);

  return (
    <div className="mt-2 flex flex-wrap gap-1 text-[9px] text-slate-500">
      {rows.map((row) => (
        <span key={row} className="border border-white/10 bg-black/25 px-1.5 py-0.5">
          {row}
        </span>
      ))}
    </div>
  );
}

function formatSigned(value: number) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function clampGaugeValue(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function GuildOverview({
  activeCount,
  completedCount,
  openCount,
  guildProgress,
  noticeCount,
  requestCount,
  completedLog,
  activityLogs,
  logsLoading,
  onOpenNotices,
  onReopen,
  onDeleteCompleted,
  busy,
}: {
  activeCount: number;
  completedCount: number;
  openCount: number;
  guildProgress: {
    completedCount: number;
    exp: number;
    rankProgress: number;
  };
  noticeCount: number;
  requestCount: number;
  completedLog: CompletedQuestEntry[];
  activityLogs: QuestLog[];
  logsLoading: boolean;
  onOpenNotices: () => void;
  onReopen: (id: number) => void;
  onDeleteCompleted: (id: number) => void;
  busy: boolean;
}) {
  const stats = [
    {
      label: "討伐数",
      value: String(GUILD_STATS.questsCleared + completedCount),
      icon: "🏆",
    },
    { label: "進行中", value: String(activeCount), icon: "📜" },
    { label: "未受注", value: String(openCount), icon: "◆" },
    { label: "ギルドランク", value: GUILD_STATS.guildRank, icon: "👑" },
    {
      label: "今週のXP",
      value: GUILD_STATS.weeklyXp.toLocaleString(),
      icon: "✨",
    },
    { label: "士気", value: `${GUILD_STATS.morale}%`, icon: "💚" },
  ];

  return (
    <div
      className={`min-h-0 flex-1 overflow-y-auto custom-scroll space-y-3 pb-20 lg:pb-1 pr-1 ${busy ? "opacity-80 pointer-events-none" : ""}`}
    >
      <section className="rpg-frame guild-bulletin-gateway p-3 sm:p-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-[family-name:var(--font-display)] text-[10px] tracking-[0.22em] text-[var(--color-gold)]/80">
              GUILD NEWS
            </p>
            <h3 className="pixel-window-title mt-1 text-base font-semibold">
              ギルド速報
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              警報・受信依頼・重要予定・遠征帰還をまとめて確認できます。
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenNotices}
            className="quest-btn-primary min-h-11 shrink-0 px-3 text-xs"
          >
            速報を見る
          </button>
        </header>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="border-2 border-red-300/45 bg-red-500/10 px-3 py-2 shadow-[2px_2px_0_#000]">
            <span className="text-slate-400">ギルド警報</span>
            <strong className="ml-2 text-red-100">{noticeCount}</strong>
          </div>
          <div className="border-2 border-[var(--color-gold)]/45 bg-[var(--color-gold)]/10 px-3 py-2 shadow-[2px_2px_0_#000]">
            <span className="text-slate-400">受信依頼</span>
            <strong className="ml-2 text-[var(--color-gold-bright)]">{requestCount}</strong>
          </div>
        </div>
      </section>

      <section className="rpg-frame p-3 sm:p-4">
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-[var(--color-gold)]/20">
          <div>
            <h3 className="pixel-window-title text-base font-semibold">ギルド進捗</h3>
            <p className="text-xs text-slate-500 mt-1">
              今日の達成がギルド全体の成長として見える場所です。
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenNotices}
            className="quest-btn-ghost min-h-11 px-3 text-xs"
          >
            ギルド速報 {noticeCount + requestCount}
          </button>
        </header>
        <div className="grid grid-cols-2 gap-3">
          <ProgressStat label="今日の達成クエスト数" value={`${guildProgress.completedCount}件`} />
          <ProgressStat label="今日の獲得EXP" value={`${guildProgress.exp} EXP`} />
        </div>
        <div className="mt-4">
          <div className="flex justify-between text-xs text-slate-400">
            <span>ギルドランクゲージ</span>
            <span>{guildProgress.rankProgress}%</span>
          </div>
          <div className="mt-2 h-4 overflow-hidden border-2 border-white/30 bg-black/60">
            <div
              className="h-full bg-[var(--color-gold-bright)] transition-all duration-700"
              style={{ width: `${guildProgress.rankProgress}%` }}
            />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className="rpg-frame p-3 text-center animate-fade-up hover:border-[var(--color-gold)]/50 transition-colors"
            style={{
              animationDelay: `${i * 60}ms`,
              animationFillMode: "both",
            }}
          >
            <span className="text-2xl">{s.icon}</span>
            <p className="text-[10px] text-slate-500 mt-2 tracking-wider">
              {s.label}
            </p>
            <p className="pixel-title text-lg sm:text-xl gold-text mt-1">
              {s.value}
            </p>
          </div>
        ))}
      </div>

      <section className="rpg-frame p-3 sm:p-4">
        <header className="mb-3 pb-3 border-b border-[var(--color-gold)]/20">
          <h3 className="pixel-window-title text-sm font-semibold">
            冒険ログ・遠征ログ・依頼ログ
          </h3>
          <p className="text-[10px] text-slate-500 mt-1">
            最近のギルド活動 · リアルタイム同期
          </p>
        </header>
        <ActivityLog logs={activityLogs} loading={logsLoading} />
      </section>

      <section className="rpg-frame p-3 sm:p-4">
        <header className="mb-4 pb-3 border-b border-[var(--color-gold)]/20">
          <h3 className="pixel-window-title text-base sm:text-lg font-semibold">
            達成ログ
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            {completedCount}件達成 · Supabase同期済み
          </p>
        </header>
        <CompletedQuestLog
          entries={completedLog}
          onReopen={onReopen}
          onDelete={onDeleteCompleted}
        />
      </section>
    </div>
  );
}

function ProgressStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-2 border-white/20 bg-black/20 p-3 shadow-[3px_3px_0_#000]">
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-[var(--color-gold-bright)]">
        {value}
      </p>
    </div>
  );
}
