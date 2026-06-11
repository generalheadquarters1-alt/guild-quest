import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
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
  formatRemainingTime,
  formatRewardItems,
  getCurrentExpedition,
  getExpeditionTicketsForRank as getTicketsForRank,
  isExpeditionReady,
  type Expedition,
  type ExpeditionDestination,
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
import { GUILD_STATS } from "./data/quests";
import type { CompletedQuestEntry, PartyMember, Quest } from "./data/quests";
import { useExpeditions } from "./hooks/useExpeditions";
import { useCalendarEvents } from "./hooks/useCalendarEvents";
import { useAdventurerTasks } from "./hooks/useAdventurerTasks";
import { useGuildOperations } from "./hooks/useGuildOperations";
import type { QuestLog } from "./lib/questLogApi";
import { useQuestLogs } from "./hooks/useQuestLogs";
import { useQuests } from "./hooks/useQuests";
import { useStaff } from "./hooks/useStaff";
import {
  claimExpeditionReward,
  ExpeditionError,
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
  isEmptySlot,
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
  | "activity"
  | "stats"
  | "settings";
type MobilePanel = "quests" | "party";
type QuickFilter = "open" | "urgent" | "succession" | "mine" | "completed";
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
    <div className="guild-entry-screen quest-bg h-dvh overflow-y-auto relative flex items-start justify-center px-3 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:items-center sm:px-4 sm:py-8">
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

      <section className="guild-gate-card rpg-frame w-full max-w-sm px-4 py-4 sm:max-w-md sm:px-7 sm:py-8 animate-fade-up">
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

  const isGuildOfficer = canIssueDirective(selectedMember?.roleLevel);

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
    if (selectedPlayer) saveSelectedPlayer(selectedPlayer);
  }, [selectedPlayer]);

  useEffect(() => {
    if (selectedMember?.avatarType) {
      saveSelectedAvatar(selectedMember.avatarType);
    }
  }, [selectedMember]);

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
          message: "気付きの書の更新に失敗しました。",
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

  const myQuestCount = countMyQuests(activeQuests, selectedPlayer);

  const baseActive = useMemo(() => {
    return nav === "my"
      ? activeQuests.filter((q) => isPlayerOnQuest(q, selectedPlayer))
      : activeQuests;
  }, [activeQuests, nav, selectedPlayer]);

  const sortedActive = useMemo(() => {
    const filtered =
      quickFilter === "open"
        ? baseActive.filter((q) => q.status === "open")
        : quickFilter === "urgent"
          ? baseActive.filter((q) => q.urgency >= 4)
          : quickFilter === "succession"
            ? baseActive.filter((q) => q.status === "succession_needed")
            : quickFilter === "mine"
              ? baseActive.filter((q) => isPlayerOnQuest(q, selectedPlayer))
              : quickFilter === "completed"
                ? []
                : baseActive;
    return sortQuests(filtered);
  }, [baseActive, quickFilter, selectedPlayer]);

  const sortedCompleted = useMemo(() => {
    const completed =
      nav === "my"
        ? completedHistory.filter((entry) =>
            isPlayerOnQuest(entry.quest, selectedPlayer),
          )
        : completedHistory;
    return sortCompletedLog(completed);
  }, [completedHistory, nav, selectedPlayer]);

  const recommendedQuest = useMemo(() => {
    const candidates = activeQuests.filter(
      (q) => q.status === "open" || q.status === "succession_needed",
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
  const urgentCount = activeQuests.filter((q) => q.urgency >= 4).length;
  const successionCount = activeQuests.filter(
    (q) => q.status === "succession_needed",
  ).length;
  const filterCounts: Record<QuickFilter, number> = {
    open: baseActive.filter((q) => q.status === "open").length,
    urgent: baseActive.filter((q) => q.urgency >= 4).length,
    succession: baseActive.filter((q) => q.status === "succession_needed")
      .length,
    mine: activeQuests.filter((q) => isPlayerOnQuest(q, selectedPlayer)).length,
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

  const editingCalendarEvent =
    calendarForm.type === "edit"
      ? calendarEventById.get(calendarForm.eventId) ?? null
      : null;

  const detailCalendarEvent =
    calendarDetail.type === "open"
      ? calendarEventById.get(calendarDetail.eventId) ?? null
      : null;

  const visibleTasks = useMemo(() => {
    return adventurerTasks.filter(
      (task) => task.ownerName === selectedPlayer || task.isPublic,
    );
  }, [adventurerTasks, selectedPlayer]);

  const selectedPlayerTasks = useMemo(() => {
    return adventurerTasks.filter((task) => task.ownerName === selectedPlayer);
  }, [adventurerTasks, selectedPlayer]);

  const editingTask =
    taskForm.type === "edit" ? findTask(taskForm.taskId) ?? null : null;

  const detailTask =
    taskDetail.type === "open" ? findTask(taskDetail.taskId) ?? null : null;

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
        request.toPlayer === selectedPlayer &&
        request.status === "pending" &&
        request.requestType === "assignment",
    );
    const receivedSuggestions = guildRequests.filter(
      (request) =>
        request.toPlayer === selectedPlayer &&
        request.status === "pending" &&
        request.requestType === "suggestion",
    );
    const receivedDirectives = guildRequests.filter(
      (request) =>
        request.toPlayer === selectedPlayer &&
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
  }, [expeditions, guildRequests, now, selectedPlayer, selectedPlayerTasks]);

  const relevantNotices = useMemo(() => {
    return guildNotices.filter(
      (notice) =>
        !notice.dismissed &&
        (!notice.targetPlayer ||
          notice.targetPlayer === selectedPlayer ||
          isGuildOfficer),
    );
  }, [guildNotices, isGuildOfficer, selectedPlayer]);

  const receivedGuildRequests = useMemo(() => {
    return guildRequests.filter(
      (request) =>
        request.toPlayer === selectedPlayer &&
        (request.status === "pending" ||
          (request.requestType === "directive" && request.status !== "rejected")),
    );
  }, [guildRequests, selectedPlayer]);

  const urgentReport = useMemo(() => {
    const activeTasks = selectedPlayerTasks.filter(
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
  }, [selectedPlayerTasks, urgentReportSeen]);

  useEffect(() => {
    for (const request of guildRequests) {
      if (
        request.toPlayer !== selectedPlayer ||
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
  }, [guildRequests, selectedPlayer]);

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
    void runAction(
      `accept-${questId}`,
      () => acceptQuest(quest, selectedPlayer),
      null,
      (updated) => {
        enqueueGuildMessage(
          `${selectedPlayer} が『${updated.title}』に挑戦しました！`,
          { icon: selectedMember?.avatar ?? "🧙" },
        );
      },
    );
  };

  const handleBecomeSuccessor = (questId: number) => {
    const quest = findQuest(questId);
    if (!quest || !selectedPlayer) return;
    void runAction(
      `successor-${questId}`,
      () => becomeSuccessor(quest, selectedPlayer),
      null,
      (updated) => {
        enqueueGuildMessage(
          `${selectedPlayer} が『${updated.title}』を継承しました！`,
          { icon: selectedMember?.avatar ?? "🧙" },
        );
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
    void startExpedition(selectedPlayer, destination)
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
    const nextLevel =
      Math.floor(((selectedMember?.exp ?? 0) + expedition.rewardExp) / 100) + 1;
    const itemLines = formatRewardItems(expedition.rewardItems);

    setActionError(null);
    setPendingAction(`expedition-claim-${expedition.id}`);
    void claimExpeditionReward(expedition, selectedPlayer)
      .then(() => {
        enqueueGuildMessage(`${selectedPlayer} が遠征から帰還しました！`, {
          durationMs: 1900,
        });
        enqueueMessage({
          speaker: "報酬",
          message: "遠征から帰還しました！",
          icon: "🎁",
          tone: "reward",
          avatarType:
            selectedMember?.avatarType ?? loadSelectedAvatar(DEFAULT_AVATAR_TYPE),
          lines: [
            `EXP +${expedition.rewardExp}`,
            `GOLD +${expedition.rewardGold}`,
            `ギルドEXP +${expedition.rewardGuildExp}`,
            ...itemLines,
          ],
          durationMs: 3400,
        });
        if (nextLevel > previousLevel) {
          enqueueGuildMessage(`${selectedPlayer} は Lv.${nextLevel} に上がりました！`, {
            durationMs: 2600,
          });
        }
        addToast("報酬を受け取りました。");
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
        if (saved.calendarEventId != null) {
          enqueueGuildMessage("任務の納期をギルド暦に記しました。", {
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

    void runAction(
      `task-delegate-${taskId}`,
      () => delegateTaskToQuest(task, selectedPlayer),
      null,
      ({ quest }) => {
        enqueueGuildMessage(`『${quest.title}』をギルドへ依頼しました！`, {
          durationMs: 2400,
        });
        void reloadTasks();
        void reload();
      },
    );
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
                onClick={() => setTaskForm({ type: "create" })}
                disabled={boardDisabled}
                className="quest-btn-primary mobile-post-command text-xs px-2.5 py-1.5 disabled:opacity-50"
              >
                任務
              </button>
            </div>
          </div>
        </header>

        <div className="game-playfield min-h-0 flex-1 overflow-hidden flex flex-col lg:flex-row gap-0 lg:gap-4 p-0 lg:p-3">
          <Sidebar
            active={nav}
            onNavigate={setNav}
            quickFilter={quickFilter}
            onQuickFilter={(filter) => {
              setQuickFilter(filter);
              if (filter === "succession") {
                setNav("board");
              }
              setMobilePanel("quests");
            }}
            myQuestCount={myQuestCount}
            activeQuestCount={activeQuests.length}
            onOpenGuide={() => setGuideOpen(true)}
            className="hidden lg:flex lg:w-56 xl:w-64 shrink-0 h-full min-h-0"
          />

          <main
            className={`flex-1 min-h-0 overflow-hidden flex flex-col min-w-0 px-3 py-2 lg:px-0 lg:py-0 ${
              mobilePanel === "party" ? "hidden lg:flex" : "flex"
            }`}
          >
            <div className="mb-1.5 shrink-0">
              <div className="rpg-frame board-hero px-2.5 py-1.5 sm:px-4 sm:py-3 overflow-hidden">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="hidden sm:block font-[family-name:var(--font-display)] text-[10px] tracking-[0.24em] text-[var(--color-gold)]/80">
                      GUILD BOARD
                    </p>
                    <h2 className="pixel-window-title text-sm sm:text-xl font-bold">
                      {quickFilter === "succession"
                        ? "助っ人募集"
                        : quickFilter === "completed"
                          ? "完了ログ"
                          : quickFilter === "open"
                            ? "未受注クエスト"
                            : quickFilter === "urgent"
                              ? "緊急クエスト"
                              : quickFilter === "mine"
                                ? "自分のクエスト"
                                : nav === "notebook"
                                  ? "本日の任務"
                                  : nav === "notices"
                                    ? "気付きの書"
                                  : nav === "board"
                        ? "ギルド依頼"
                        : nav === "my"
                          ? "自分の依頼"
                          : nav === "calendar"
                            ? "ギルド暦"
                          : nav === "expedition"
                            ? "遠征"
                          : nav === "activity"
                            ? "冒険の記録"
                            : nav === "settings"
                              ? "設定"
                              : "ギルドの記録"}
                    </h2>
                    <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 truncate">
                      {nav === "activity"
                        ? "ギルド内の行動記録 · Realtime同期"
                        : nav === "settings"
                          ? `操作中の冒険者 ${selectedPlayer || "未選択"}`
                          : nav === "notebook"
                            ? `冒険者手帳 · ${selectedPlayerTasks.length}件の記録`
                            : nav === "notices"
                              ? `受信 ${receivedGuildRequests.length}件 · 気付き ${relevantNotices.length}件`
                          : nav === "calendar"
                            ? `${formatCalendarMonth(calendarMonth)} · ${calendarEvents.length}件`
                          : nav === "expedition"
                            ? `遠征チケット ${resources.expeditionTickets}枚 · GOLD ${resources.gold}`
                          : nav === "stats"
                        ? "ギルドの戦況 · Realtime同期"
                        : `${quickFilter === "completed" ? sortedCompleted.length : sortedActive.length}件表示 · 操作中の冒険者 ${selectedPlayer || "未選択"}`}
                    </p>
                  </div>
                  <div className="hidden sm:flex flex-wrap items-center gap-2">
                    <div className="hidden xl:flex flex-wrap gap-2 text-[10px] sm:text-xs">
                      {urgentCount > 0 && (
                        <span className="pixel-chip px-2 py-1 border-red-400/60 text-red-300 bg-red-500/10">
                          緊急 {urgentCount}
                        </span>
                      )}
                      {openCount > 0 && (
                        <span className="pixel-chip px-2 py-1 border-[var(--color-gold)]/60 text-[var(--color-gold)] bg-[var(--color-gold)]/10">
                          未受注 {openCount}
                        </span>
                      )}
                      {successionCount > 0 && (
                        <span className="pixel-chip px-2 py-1 border-[var(--color-rare)]/60 text-[var(--color-rare)] bg-[var(--color-rare)]/10">
                          助っ人募集 {successionCount}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setTaskForm({ type: "create" })}
                      disabled={boardDisabled}
                      className="quest-btn-primary hidden lg:inline-flex min-h-11 px-4 text-sm disabled:opacity-50"
                    >
                      任務を記す
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
                dashboard={taskDashboard}
                calendarEventById={calendarEventById}
                questById={new Map(quests.map((quest) => [quest.id, quest]))}
                busy={busy || !isOnline}
                onCreate={() => setTaskForm({ type: "create" })}
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
                onOpenNotices={() => setNav("notices")}
                onOpenRequestForm={(requestType, taskId) =>
                  setGuildRequestForm({ type: "open", requestType, taskId })
                }
                canIssueDirective={isGuildOfficer}
              />
            ) : nav === "notices" ? (
              <GuildNoticesPanel
                notices={relevantNotices}
                requests={receivedGuildRequests}
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
                staff={staff}
                loading={calendarLoading}
                monthDate={calendarMonth}
                selectedDate={selectedCalendarDate}
                onMonthChange={setCalendarMonth}
                onSelectedDateChange={setSelectedCalendarDate}
                onCreate={(date) => setCalendarForm({ type: "create", date })}
                onEdit={(eventId) => setCalendarForm({ type: "edit", eventId })}
                onOpenDetail={(eventId) =>
                  setCalendarDetail({ type: "open", eventId })
                }
                busy={busy}
              />
            ) : nav === "expedition" ? (
              <ExpeditionPanel
                resources={resources}
                expeditions={expeditions}
                currentExpedition={currentExpedition}
                loading={expeditionsLoading}
                now={now}
                busy={busy || !isOnline}
                onStart={handleStartExpedition}
                onClaim={handleClaimExpedition}
              />
            ) : nav === "activity" ? (
              <ActivityLogScreen logs={logs} loading={logsLoading} />
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
                onOpenNotices={() => setNav("notices")}
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
                  {nav === "my" && quickFilter == null && (
                    <ExpeditionPanel
                      resources={resources}
                      expeditions={expeditions}
                      currentExpedition={currentExpedition}
                      loading={expeditionsLoading}
                      now={now}
                      busy={busy || !isOnline}
                      onStart={handleStartExpedition}
                      onClaim={handleClaimExpedition}
                      compact
                    />
                  )}
                  <EmptyState
                    nav={nav}
                    filter={quickFilter}
                  />
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
                  {nav === "my" && quickFilter == null && (
                    <ExpeditionPanel
                      resources={resources}
                      expeditions={expeditions}
                      currentExpedition={currentExpedition}
                      loading={expeditionsLoading}
                      now={now}
                      busy={busy || !isOnline}
                      onStart={handleStartExpedition}
                      onClaim={handleClaimExpedition}
                      compact
                    />
                  )}
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
                </div>
              </div>
            )}
          </main>

          <aside
            className={`lg:w-72 xl:w-80 shrink-0 min-h-0 mx-3 mb-3 lg:mx-0 lg:mb-0 flex-col gap-3 ${
              mobilePanel === "quests" ? "hidden lg:flex" : "flex"
            }`}
          >
            <PartyPanel
              staff={staff}
              loading={staffLoading}
              selectedPlayer={selectedPlayer}
              onSelectPlayer={setSelectedPlayer}
              className="w-full flex-1 min-h-0"
            />
            <AdventureLogPanel
              logs={logs}
              loading={logsLoading}
              className="hidden lg:block"
            />
          </aside>
        </div>

        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 px-2 pb-[calc(env(safe-area-inset-bottom)+0.35rem)]">
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
                  setNav(item.id);
                  setQuickFilter(null);
                  setMobilePanel("quests");
                }}
                className={`min-h-14 flex flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-semibold transition-colors font-[family-name:var(--font-pixel)] ${
                  nav === item.id && mobilePanel === "quests"
                    ? "nav-active"
                    : "text-slate-500"
                }`}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setMobilePanel("party")}
              className={`min-h-14 flex flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-semibold border-l border-[var(--color-gold)]/15 transition-colors font-[family-name:var(--font-pixel)] ${
                mobilePanel === "party" ? "nav-active" : "text-slate-500"
              }`}
            >
              <span className="text-base">👥</span>
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
          setNav("notices");
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
            ? getRelatedTasksForEvent(detailCalendarEvent, adventurerTasks)
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
    <div className="game-hud hidden lg:grid grid-cols-[minmax(17rem,0.9fr)_minmax(22rem,1.25fr)_minmax(18rem,1fr)] gap-3 px-3 pt-3">
      <section className="rpg-frame hud-title-panel px-4 py-3 flex items-center gap-3">
        <div className="guild-crest" aria-hidden>
          ⚔
        </div>
        <div>
          <h1 className="pixel-title text-2xl font-bold gold-text">
            ギルドクエスト
          </h1>
          <p className="pixel-title text-xs text-[var(--color-gold-bright)] tracking-widest">
            ++ GUILD QUEST ++
          </p>
        </div>
      </section>

      <SelectedPlayerPanel
        selectedMember={selectedMember}
        selectedPlayer={selectedPlayer}
      />

      <section className="rpg-frame px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="slime-orb" aria-hidden>
            ◆
          </div>
          <div className="min-w-0 flex-1">
            <p className="pixel-title text-sm text-slate-300">
              ギルドランク {GUILD_STATS.guildRank}
            </p>
            <p className="mt-1 text-sm text-[var(--color-gold-bright)]">
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
    <section className="rpg-frame selected-player-panel px-4 py-2">
      <p className="pixel-title text-xs text-[var(--color-gold-bright)]">
        操作中の冒険者
      </p>
      <div className="mt-2 flex items-center gap-3">
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
            <p className="pixel-title text-lg text-slate-50 truncate">
              {selectedMember?.name ?? selectedPlayer ?? "未選択"}
            </p>
            <p className="pixel-title text-base text-slate-50">
              Lv.{selectedMember?.level ?? "--"}
            </p>
          </div>
          <p className="text-xs text-[var(--color-gold)] truncate">
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
    <div className={compact ? "mt-1" : "mt-2"}>
      <div className="flex justify-between text-[10px] text-slate-400">
        <span>{label}</span>
        <span>{Math.round(value)}%</span>
      </div>
      <div className={compact ? "hud-meter h-2" : "hud-meter h-3"}>
        <div className={`h-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function AdventureLogPanel({
  logs,
  loading,
  className = "",
}: {
  logs: QuestLog[];
  loading: boolean;
  className?: string;
}) {
  return (
    <section className={`rpg-frame p-4 ${className}`}>
      <header className="mb-3 flex items-center justify-between border-b-2 border-[var(--color-gold)]/25 pb-3">
        <h2 className="pixel-window-title text-sm font-bold">冒険の記録</h2>
        <span className="pixel-chip px-2 py-1 text-[10px] text-slate-400">
          最新
        </span>
      </header>
      <ActivityLog logs={logs.slice(0, 5)} loading={loading} />
    </section>
  );
}

function ActivityLogScreen({
  logs,
  loading,
}: {
  logs: QuestLog[];
  loading: boolean;
}) {
  return (
    <section className="rpg-frame min-h-0 flex-1 overflow-hidden p-3 sm:p-4 flex flex-col">
      <header className="mb-3 shrink-0 border-b-2 border-[var(--color-gold)]/25 pb-3">
        <p className="font-[family-name:var(--font-display)] text-[10px] tracking-[0.24em] text-[var(--color-gold)]/80">
          EVENT LOG
        </p>
        <h3 className="pixel-window-title mt-1 text-base font-semibold">
          冒険の記録
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          受注、継承、達成などギルドで起きた出来事を確認できます。
        </p>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto custom-scroll pr-1">
        <ActivityLog logs={logs} loading={loading} />
      </div>
    </section>
  );
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
      : quest.status === "in_progress"
        ? "挑戦中"
        : quest.status === "succession_needed"
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
                依頼主: {quest.requester} / 推定時間: {quest.estimatedTime}
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
          <DetailCell label="Lv" value={quest.level} />
          <DetailCell label="緊急度" value={`◆`.repeat(quest.urgency)} />
          <DetailCell label="重要度" value={`◆`.repeat(quest.importance)} />
          <DetailCell
            label="挑戦者"
            value={quest.challenger}
            member={staffByName.get(quest.challenger)}
          />
          <DetailCell
            label="継承者1"
            value={quest.successor1}
            member={staffByName.get(quest.successor1)}
          />
          <DetailCell
            label="継承者2"
            value={quest.successor2}
            member={staffByName.get(quest.successor2)}
          />
          <DetailCell label="装飾ランク" value={`${quest.priority} Rank`} />
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

function TaskNotebookPanel({
  tasks,
  selectedPlayer,
  dashboard,
  calendarEventById,
  questById,
  busy,
  onCreate,
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
  onCreate: () => void;
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

  return (
    <section className="notebook-panel min-h-0 flex-1 overflow-hidden flex flex-col gap-2">
      <div className="rpg-frame notebook-cover p-2.5 sm:p-3 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-[family-name:var(--font-display)] text-[10px] tracking-[0.22em] text-[var(--color-gold)]/80">
              ADVENTURER NOTEBOOK
            </p>
            <h3 className="pixel-window-title mt-1 text-base sm:text-lg font-semibold">
              本日の任務
            </h3>
            <p className="mt-1 text-xs text-slate-500 truncate">
              {selectedPlayer || "冒険者"} の手帳から、必要な任務だけをギルド依頼にします。
            </p>
          </div>
          <button
            type="button"
            onClick={onCreate}
            disabled={busy}
            className="quest-btn-primary min-h-11 px-3 text-xs disabled:opacity-45"
          >
            任務を記す
          </button>
        </div>

        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-1.5">
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
                className={`pixel-chip min-h-11 shrink-0 px-2.5 text-[11px] font-semibold transition-all ${
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
              手帳は静かです
            </h4>
            <p className="mt-2 text-sm text-slate-500">
              この期間の任務はありません。必要な作業を任務として記録できます。
            </p>
            <button
              type="button"
              onClick={onCreate}
              disabled={busy}
              className="quest-btn-primary mt-4 min-h-11 px-4 text-sm disabled:opacity-45"
            >
              任務を記す
            </button>
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
          ) : (
            <button
              type="button"
              onClick={() => onComplete(task.id)}
              disabled={disabled}
              className="quest-btn-primary min-h-11 text-xs disabled:opacity-45"
            >
              任務完了
            </button>
          )}
          {task.status !== "completed" && task.status !== "delegated" ? (
            <button
              type="button"
              onClick={() => onDelegate(task.id)}
              disabled={busy}
              className="quest-btn-ghost min-h-11 text-xs disabled:opacity-45"
            >
              ギルドへ依頼
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
          {task.status !== "completed" && (
            <button
              type="button"
              onClick={() => onOpenRequestForm("suggestion", task.id)}
              disabled={busy}
              className="quest-btn-ghost min-h-11 text-xs disabled:opacity-45"
            >
              助言する
            </button>
          )}
          {task.status !== "completed" && (
            <button
              type="button"
              onClick={() => onOpenRequestForm("assignment", task.id)}
              disabled={busy}
              className="quest-btn-ghost min-h-11 text-xs disabled:opacity-45"
            >
              指名依頼
            </button>
          )}
          {canUseDirective && task.status !== "completed" && (
            <button
              type="button"
              onClick={() => onOpenRequestForm("directive", task.id)}
              disabled={busy}
              className="quest-btn-ghost min-h-11 border-red-400/70 text-red-200 disabled:opacity-45"
            >
              ギルド指令
            </button>
          )}
          {task.status !== "completed" && task.status !== "delegated" && (
            <button
              type="button"
              onClick={() => onOpenDetail(task.id)}
              disabled={busy}
              className="quest-btn-ghost min-h-11 text-xs disabled:opacity-45"
            >
              詳細
            </button>
          )}
          {task.status !== "completed" && task.status !== "delegated" && (
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
    return [...calendarEvents].sort((a, b) => {
      const aFuture = a.eventDate >= today ? 0 : 1;
      const bFuture = b.eventDate >= today ? 0 : 1;
      if (aFuture !== bFuture) return aFuture - bFuture;
      const date = a.eventDate.localeCompare(b.eventDate);
      if (date !== 0) return date;
      return (a.startTime || "99:99").localeCompare(b.startTime || "99:99");
    });
  }, [calendarEvents]);

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
                <option value="">関連する予定を選択</option>
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
                ギルドへ依頼
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
    return [...calendarEvents].sort((a, b) => {
      const aFuture = a.eventDate >= today ? 0 : 1;
      const bFuture = b.eventDate >= today ? 0 : 1;
      if (aFuture !== bFuture) return aFuture - bFuture;
      return a.eventDate.localeCompare(b.eventDate);
    });
  }, [calendarEvents]);

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
                <option value="">関連する予定を選択</option>
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
  selectedPlayer,
  loading,
  busy,
  onDismissNotice,
  onAcceptRequest,
  onRejectRequest,
}: {
  notices: GuildNotice[];
  requests: GuildRequest[];
  selectedPlayer: string;
  loading: boolean;
  busy: boolean;
  onDismissNotice: (noticeId: number) => void;
  onAcceptRequest: (request: GuildRequest) => void;
  onRejectRequest: (request: GuildRequest) => void;
}) {
  if (loading) {
    return (
      <section className="rpg-frame min-h-0 flex-1 p-4">
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse border-2 border-white/15 bg-white/5 shadow-[2px_2px_0_#000]" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="notices-panel min-h-0 flex-1 overflow-hidden flex flex-col gap-2">
      <div className="rpg-frame notice-book-cover p-3 shrink-0">
        <p className="font-[family-name:var(--font-display)] text-[10px] tracking-[0.22em] text-[var(--color-gold)]/80">
          NOTICE CODEX
        </p>
        <h3 className="pixel-window-title mt-1 text-base font-semibold">
          気付きの書
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          {selectedPlayer} 宛ての助言・依頼・期限警告を確認します。
        </p>
      </div>

      <div className={`min-h-0 flex-1 overflow-y-auto custom-scroll space-y-2 pb-20 lg:pb-1 pr-1 ${busy ? "opacity-80 pointer-events-none" : ""}`}>
        {requests.length > 0 && (
          <section className="rpg-frame p-3">
            <header className="mb-3 border-b border-[var(--color-gold)]/25 pb-3">
              <h4 className="pixel-window-title text-sm font-semibold">
                受信した提案・依頼
              </h4>
            </header>
            <div className="grid gap-2">
              {requests.map((request) => (
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

        <section className="rpg-frame p-3">
          <header className="mb-3 border-b border-[var(--color-gold)]/25 pb-3">
            <h4 className="pixel-window-title text-sm font-semibold">
              気付き
            </h4>
          </header>
          {notices.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              今のところ新しい気付きはありません。
            </p>
          ) : (
            <div className="grid gap-2">
              {notices.map((notice) => (
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
          気付きの書で確認し、必要なら助言・依頼で支援してください。
        </p>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={onOpenNotices} className="quest-btn-primary">
            気付きの書へ
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
                {Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => (
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
    { id: "urgent", label: "緊急" },
    { id: "succession", label: "助っ人募集" },
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
          className={`pixel-chip min-h-11 shrink-0 px-2.5 text-[11px] font-semibold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold-bright)] ${
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
              className={`pixel-chip min-h-11 shrink-0 px-2.5 text-[11px] font-semibold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold-bright)] ${
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
  busy: boolean;
  onAccept: (questId: number) => void;
  onBecomeSuccessor: (questId: number) => void;
  onRequestSuccession: (questId: number) => void;
  onRequestComplete: (questId: number) => void;
  onEdit: (questId: number) => void;
  onRequestDelete: (questId: number) => void;
  onOpenDetail: (questId: number) => void;
}) {
  const partySlots = [quest.challenger, quest.successor1, quest.successor2];
  const openSlots = partySlots.filter(isEmptySlot).length;
  const reason =
    quest.priority === "S"
      ? "緊急度の高いクエストです。対応可能なら最優先で確認してください。"
      : quest.status === "open"
        ? "まだ誰も挑戦していません。今すぐ受注できます。"
        : "助っ人を募集しています。継承参加で進行を支援できます。";

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
  if (!open) return null;

  const items = [
    {
      title: "まず操作するメンバーを選択",
      text: "右下の「パーティ」から自分を選ぶと、挑戦・継承・討伐完了が自分名義になります。",
    },
    {
      title: "迷ったらおすすめを見る",
      text: "ボード上部のおすすめは、未受注または助っ人募集の中から優先度が高いものを表示します。",
    },
    {
      title: "状態で素早く絞り込み",
      text: "未受注、緊急、助っ人募集、自分の依頼、達成済みを1タップで切り替えられます。",
    },
    {
      title: "達成後は遠征へ",
      text: "討伐完了で遠征チケットを獲得します。PCは左メニュー、スマホは自分タブから遠征に出発できます。",
    },
  ];

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
      <div className="modal-panel relative rpg-frame w-full max-w-md p-5">
        <p className="font-[family-name:var(--font-display)] text-[10px] tracking-[0.22em] text-[var(--color-gold)]/80">
          QUICK START
        </p>
        <h2 id="guide-title" className="pixel-window-title mt-1 text-xl font-bold">
          初回ガイド
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          毎日の作業をクエストとして扱うための、最小限の使い方です。
        </p>
        <div className="mt-4 space-y-3">
          {items.map((item, index) => (
            <section
              key={item.title}
              className="border-2 border-white/20 bg-black/22 p-3 shadow-[3px_3px_0_#000]"
            >
              <h3 className="text-sm font-semibold text-slate-100">
                <span className="mr-2 text-[var(--color-gold-bright)]">
                  {index + 1}
                </span>
                {item.title}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                {item.text}
              </p>
            </section>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="quest-btn-primary mt-5 w-full"
        >
          はじめる
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
    filter === "urgent"
      ? "緊急クエストはありません"
      : filter === "open"
        ? "現在、受注可能なクエストはありません"
        : filter === "succession"
          ? "助っ人募集はありません"
          : filter === "mine"
            ? "自分の依頼はありません"
            : nav === "my"
              ? "担当中のクエストはありません"
              : "ギルドは平穏です";
  const message =
    filter === "urgent"
      ? "緊急の合図は出ていません。通常クエストを落ち着いて進められます。"
      : filter === "open"
        ? "まだ誰も挑戦していないクエストはありません。手帳の任務から依頼化できます。"
        : filter === "succession"
          ? "現在、助っ人を募集しているクエストはありません。"
        : filter === "mine"
            ? "対応できるクエストがあれば、挑戦または継承で参加できます。"
            : nav === "my"
              ? "挑戦するか、継承者として参加してください。"
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
  staff,
  loading,
  monthDate,
  selectedDate,
  onMonthChange,
  onSelectedDateChange,
  onCreate,
  onEdit,
  onOpenDetail,
  busy,
}: {
  events: CalendarEvent[];
  quests: Quest[];
  staff: PartyMember[];
  loading: boolean;
  monthDate: Date;
  selectedDate: string;
  onMonthChange: (date: Date) => void;
  onSelectedDateChange: (date: string) => void;
  onCreate: (date: string) => void;
  onEdit: (eventId: number) => void;
  onOpenDetail: (eventId: number) => void;
  busy: boolean;
}) {
  const monthGrid = getMonthGrid(monthDate);
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const list = map.get(event.eventDate) ?? [];
      list.push(event);
      map.set(event.eventDate, list);
    }
    for (const list of map.values()) {
      list.sort(compareCalendarEvents);
    }
    return map;
  }, [events]);
  const selectedEvents = eventsByDate.get(selectedDate) ?? [];
  const weekRange = getWeekRange(new Date());
  const weekEvents = events
    .filter((event) => isDateWithinRange(event.eventDate, weekRange.start, weekRange.end))
    .sort(compareCalendarEvents);
  const activeStaff = staff.filter((member) => member.isActive !== false);

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
            <button type="button" onClick={() => moveMonth(-1)} className="quest-btn-ghost min-h-11 px-3 text-xs">
              前月
            </button>
            <button type="button" onClick={goToday} className="quest-btn-ghost min-h-11 px-3 text-xs">
              今日へ
            </button>
            <button type="button" onClick={() => moveMonth(1)} className="quest-btn-ghost min-h-11 px-3 text-xs">
              次月
            </button>
            <button type="button" onClick={() => onCreate(selectedDate)} className="quest-btn-primary min-h-11 px-3 text-xs">
              予定追加
            </button>
          </div>
        </header>

        <div className="mb-2 flex items-center justify-between gap-2">
          <h4 className="pixel-title text-lg text-[var(--color-gold-bright)]">
            {formatCalendarMonth(monthDate)}
          </h4>
          <p className="text-xs text-slate-500">
            {loading ? "読み込み中..." : `${events.length}件の予定`}
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
            const hasHighImportance = dayEvents.some((event) => event.importance >= 4);
            const isSelected = selectedDate === cell.dateKey;
            return (
              <button
                key={cell.dateKey}
                type="button"
                onClick={() => onSelectedDateChange(cell.dateKey)}
                className={`calendar-day-cell ${cell.inMonth ? "" : "is-muted"} ${cell.isToday ? "is-today" : ""} ${isSelected ? "is-selected" : ""} ${hasHighImportance ? "has-important" : ""}`}
              >
                <span className="calendar-day-number">{cell.date.getDate()}</span>
                {dayEvents.length > 0 && (
                  <span className="calendar-day-count">{dayEvents.length}件</span>
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
              <p className="mt-1 text-xs text-slate-500">日別詳細</p>
            </div>
            <button
              type="button"
              onClick={() => onCreate(selectedDate)}
              className="quest-btn-ghost min-h-11 px-3 text-xs"
            >
              追加
            </button>
          </header>
          <EventList
            events={selectedEvents}
            quests={quests}
            emptyText="この日の予定はありません。"
            onEdit={onEdit}
            onOpenDetail={onOpenDetail}
          />
        </section>

        <section className="rpg-frame min-h-0 p-3 sm:p-4">
          <header className="mb-3 border-b border-[var(--color-gold)]/20 pb-3">
            <h3 className="pixel-window-title text-sm font-semibold">
              今週の予定
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              今日から7日間 / 個人予定は {activeStaff.length}名から選択できます
            </p>
          </header>
          <EventList
            events={weekEvents}
            quests={quests}
            emptyText="今週の予定はありません。"
            onEdit={onEdit}
            onOpenDetail={onOpenDetail}
            compact
          />
        </section>
      </div>
    </div>
  );
}

function EventList({
  events,
  quests,
  emptyText,
  onEdit,
  onOpenDetail,
  compact = false,
}: {
  events: CalendarEvent[];
  quests: Quest[];
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
  onEdit,
  onOpenDetail,
  compact = false,
}: {
  event: CalendarEvent;
  relatedQuests: Quest[];
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
  resources,
  expeditions,
  currentExpedition,
  loading,
  now,
  busy,
  compact = false,
  onStart,
  onClaim,
}: {
  resources: PlayerResources;
  expeditions: Expedition[];
  currentExpedition: Expedition | null;
  loading: boolean;
  now: number;
  busy: boolean;
  compact?: boolean;
  onStart: (destination: ExpeditionDestination) => void;
  onClaim: (expedition: Expedition) => void;
}) {
  const ready = currentExpedition
    ? isExpeditionReady(currentExpedition, now)
    : false;
  const remainingMs = currentExpedition
    ? new Date(currentExpedition.endsAt).getTime() - now
    : 0;
  const claimedHistory = expeditions.filter((expedition) => expedition.status === "claimed");
  const itemEntries = Object.entries(resources.items).filter(([, amount]) => amount > 0);

  if (loading) {
    return (
      <div className={compact ? "mb-2 space-y-2 lg:hidden" : "min-h-0 flex-1 space-y-3"}>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rpg-frame h-24 animate-pulse bg-white/5"
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
          const disabled = busy || currentExpedition != null || shortage;
          const rewardLines = [
            `EXP +${destination.rewardExp}`,
            `GOLD +${destination.rewardGold}`,
            `ギルドEXP +${destination.rewardGuildExp}`,
            destination.rareItem ? `${destination.rareItem.name} 入手の可能性` : "",
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
              </div>
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
                    : "出発"}
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
                {expedition.expeditionName} / EXP +{expedition.rewardExp} / GOLD +{expedition.rewardGold}
              </p>
            ))}
          </div>
        </section>
      )}
    </div>
  );
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
            気付きの書 {noticeCount + requestCount}
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
            冒険の記録
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
