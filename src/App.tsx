import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { ActivityLog } from "./components/ActivityLog";
import { CompletedQuestLog } from "./components/CompletedQuestLog";
import { ConfirmModal } from "./components/ConfirmModal";
import {
  QuestFormModal,
  type QuestFormData,
} from "./components/QuestFormModal";
import { PartyPanel } from "./components/PartyPanel";
import { QuestCard } from "./components/QuestCard";
import { ReopenQuestModal } from "./components/ReopenQuestModal";
import { Sidebar } from "./components/Sidebar";
import { GUILD_STATS } from "./data/quests";
import type { CompletedQuestEntry, PartyMember, Quest } from "./data/quests";
import type { QuestLog } from "./lib/questLogApi";
import { useQuestLogs } from "./hooks/useQuestLogs";
import { useQuests } from "./hooks/useQuests";
import { useStaff } from "./hooks/useStaff";
import { partitionQuests } from "./lib/questMapper";
import {
  clearSelectedPlayer,
  loadSelectedPlayer,
  resolveSelectedPlayer,
  saveSelectedPlayer,
} from "./lib/playerStorage";
import {
  acceptQuest,
  becomeSuccessor,
  completeQuest,
  deleteQuestRecord,
  editQuestFields,
  insertQuest,
  reopenQuest,
  requestSuccession,
} from "./lib/questApi";
import { isSupabaseConfigured } from "./lib/supabase";
import { ensureStaffMember } from "./lib/staffApi";
import {
  countMyQuests,
  getQuestBaseExp,
  getQuestGuildExp,
  isEmptySlot,
  isPlayerOnQuest,
  sortCompletedLog,
  sortQuests,
} from "./lib/questUtils";

type NavId = "board" | "my" | "stats";
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
  lines?: string[];
  durationMs?: number;
};
type CompletionReward = {
  title: string;
  exp: number;
  coins: number;
  guildExp: number;
};
const GUIDE_STORAGE_KEY = "todo-quest-guide-seen";
const GUILD_ACCESS_KEY = "guild_quest_access_granted";
const LEGACY_GUILD_ACCESS_KEY = "guild-quest-access";
const GUILD_CODE = import.meta.env.VITE_GUILD_CODE?.trim() ?? "";

type ModalState =
  | { type: "closed" }
  | { type: "create" }
  | { type: "edit"; questId: number };

type ConfirmState =
  | { type: "closed" }
  | { type: "complete"; questId: number }
  | { type: "delete"; questId: number };

type ReopenState = { type: "closed" } | { type: "open"; questId: number };
type DetailState = { type: "closed" } | { type: "open"; questId: number };

export default function App() {
  const [hasGuildAccess, setHasGuildAccess] = useState(() => {
    if (typeof localStorage === "undefined") return false;
    const accessGranted =
      localStorage.getItem(GUILD_ACCESS_KEY) === "true" ||
      localStorage.getItem(LEGACY_GUILD_ACCESS_KEY) === "true";
    return accessGranted && loadSelectedPlayer("") !== "";
  });

  const handleGuildEntry = async (playerName: string) => {
    await ensureStaffMember(playerName);
    localStorage.setItem(GUILD_ACCESS_KEY, "true");
    saveSelectedPlayer(playerName);
    setHasGuildAccess(true);
  };

  const handleGuildLogout = () => {
    localStorage.removeItem(GUILD_ACCESS_KEY);
    localStorage.removeItem(LEGACY_GUILD_ACCESS_KEY);
    clearSelectedPlayer();
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
  onEnter: (playerName: string) => Promise<void>;
}) {
  const [inputCode, setInputCode] = useState("");
  const [playerName, setPlayerName] = useState("");
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

    setError(null);
    setSubmitting(true);
    try {
      await onEnter(trimmedName);
    } catch {
      setError("冒険者登録に失敗しました。少し時間を置いて再度お試しください。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="quest-bg min-h-dvh overflow-hidden relative flex items-center justify-center px-4 py-8">
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

      <section className="guild-gate-card rpg-frame w-full max-w-md px-5 py-6 sm:px-7 sm:py-8 animate-fade-up">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 border-2 border-[var(--color-gold-bright)] bg-[var(--color-deep)] mb-3 animate-pulse-glow shadow-[3px_3px_0_#000]">
            <span className="text-3xl">⚔️</span>
          </div>
          <p className="font-[family-name:var(--font-display)] text-[10px] tracking-[0.28em] text-[var(--color-gold)]/80">
            GUILD ENTRY
          </p>
          <h1 className="pixel-title text-3xl font-bold gold-text mt-1">
            ギルドへの入場
          </h1>
          <p className="text-sm text-slate-300 mt-3 leading-6">
            「合言葉を知る者だけが、<br className="hidden sm:block" />
            このギルドの扉を開ける。」
          </p>
          <p className="text-xs text-slate-500 mt-2">
            合言葉と冒険者名を入力してください
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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
              className="quest-input text-base"
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
              className="quest-input text-base"
              placeholder="例：リオ"
              autoComplete="name"
              maxLength={24}
              disabled={submitting}
            />
          </label>

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

        <p className="mt-5 text-center text-[11px] leading-5 text-slate-500">
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

  const [selectedPlayer, setSelectedPlayer] = useState(() =>
    loadSelectedPlayer(""),
  );
  const [nav, setNav] = useState<NavId>("board");
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("quests");
  const [modal, setModal] = useState<ModalState>({ type: "closed" });
  const [confirm, setConfirm] = useState<ConfirmState>({ type: "closed" });
  const [reopen, setReopen] = useState<ReopenState>({ type: "closed" });
  const [detail, setDetail] = useState<DetailState>({ type: "closed" });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [quickFilter, setQuickFilter] = useState<QuickFilter | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [messageQueue, setMessageQueue] = useState<DialogueMessage[]>([]);
  const [completionBurst, setCompletionBurst] =
    useState<CompletionReward | null>(null);
  const [guideOpen, setGuideOpen] = useState(() => {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(GUIDE_STORAGE_KEY) !== "true";
  });
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  const busy = pendingAction != null;

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
    const markOnline = () => setIsOnline(true);
    const markOffline = () => setIsOnline(false);
    window.addEventListener("online", markOnline);
    window.addEventListener("offline", markOffline);
    return () => {
      window.removeEventListener("online", markOnline);
      window.removeEventListener("offline", markOffline);
    };
  }, []);

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

  const selectedMember = useMemo(
    () => staff.find((member) => member.name === selectedPlayer) ?? null,
    [staff, selectedPlayer],
  );

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

  const handleCreateQuest = (data: QuestFormData) => {
    if (!selectedPlayer) return;
    void runAction(
      "create",
      () => insertQuest(data, selectedPlayer),
      null,
      () => {
        enqueueGuildMessage("新しい依頼が掲示されました！");
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
    setConfirm({ type: "closed" });
    void runAction(
      `complete-${quest.id}`,
      () => completeQuest(quest, selectedPlayer),
      null,
      () => {
        setCompletionBurst({ title: quest.title, exp, coins, guildExp });
        enqueueGuildMessage(`『${quest.title}』を達成しました！`, {
          durationMs: 1900,
        });
        enqueueMessage({
          speaker: "報酬",
          message: "クエスト達成！",
          icon: "🎁",
          tone: "reward",
          lines: [`EXP +${exp}`, `GOLD +${coins}`, `ギルドEXP +${guildExp}`],
          durationMs: 3000,
        });
        window.setTimeout(() => setCompletionBurst(null), 1800);
        void reloadStaff();
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
      const member = await ensureStaffMember(nextName);
      saveSelectedPlayer(member.name);
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
    busy || loading || staffLoading || !selectedPlayer || !isOnline;

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
        {(!isOnline || error || actionError) && (
          <div className="mx-4 mt-3 lg:mx-4 lg:mt-0 px-4 py-2 border-2 border-red-400/55 bg-red-500/10 text-red-200 text-xs sm:text-sm flex flex-wrap items-center justify-between gap-2 shadow-[3px_3px_0_#000]">
            <span>
              {!isOnline
                ? "通信がオフラインのようです。接続が戻るまで操作を一時停止しています。"
                : actionError ?? "通信魔法に失敗しました。少し時間を置いて再度お試しください。"}
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
          boardDisabled={boardDisabled}
          onCreate={() => setModal({ type: "create" })}
        />

        <header className="lg:hidden z-20 m-2 mb-0 px-3 py-2 rpg-frame bg-[var(--color-panel)] shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h1 className="pixel-title text-lg font-bold gold-text">
                ギルドクエスト
              </h1>
              <p className="text-[10px] text-slate-400 tracking-wider truncate">
                操作中の冒険者: <span className="text-[var(--color-gold-bright)]">{selectedPlayer || "未選択"}</span>
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setGuideOpen(true)}
                className="quest-btn-ghost text-xs"
              >
                使い方
              </button>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="quest-btn-ghost text-xs px-3"
              >
                設定
              </button>
              <button
                type="button"
                onClick={() => setModal({ type: "create" })}
                disabled={boardDisabled}
                className="quest-btn-primary text-xs px-3 py-2 disabled:opacity-50"
              >
                掲示
              </button>
            </div>
          </div>
          <MobilePlayerHud
            selectedMember={selectedMember}
            selectedPlayer={selectedPlayer}
          />
        </header>

        <div className="game-playfield min-h-0 flex-1 overflow-hidden flex flex-col lg:flex-row gap-0 lg:gap-4 p-0 lg:p-3">
          <Sidebar
            active={nav}
            onNavigate={setNav}
            quickFilter={quickFilter}
            onQuickFilter={(filter) => {
              setNav("board");
              setQuickFilter(filter);
              setMobilePanel("quests");
            }}
            myQuestCount={myQuestCount}
            activeQuestCount={activeQuests.length}
            onLogout={onLogout}
            onOpenSettings={() => setSettingsOpen(true)}
            className="hidden lg:flex lg:w-56 xl:w-64 shrink-0 h-full min-h-0"
          />

          <main
            className={`flex-1 min-h-0 overflow-hidden flex flex-col min-w-0 px-3 py-2 lg:px-0 lg:py-0 ${
              mobilePanel === "party" ? "hidden lg:flex" : "flex"
            }`}
          >
            <div className="mb-2 shrink-0">
              <div className="rpg-frame board-hero px-3 py-2 sm:px-4 sm:py-3 overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-[family-name:var(--font-display)] text-[10px] tracking-[0.24em] text-[var(--color-gold)]/80">
                      GUILD BOARD
                    </p>
                    <h2 className="pixel-window-title text-base sm:text-xl font-bold">
                      {nav === "board"
                        ? "クエスト掲示板"
                        : nav === "my"
                          ? "自分の依頼"
                          : "ギルドの記録"}
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {nav === "stats"
                        ? "ギルドの戦況 · Realtime同期"
                        : `${quickFilter === "completed" ? sortedCompleted.length : sortedActive.length}件表示 · 操作中の冒険者 ${selectedPlayer || "未選択"}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex flex-wrap gap-2 text-[10px] sm:text-xs">
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
                      onClick={() => setGuideOpen(true)}
                      className="quest-btn-ghost hidden sm:inline-flex"
                    >
                      初回ガイド
                    </button>
                    <button
                      type="button"
                      onClick={() => setModal({ type: "create" })}
                      disabled={boardDisabled}
                      className="quest-btn-primary hidden sm:inline-flex disabled:opacity-50"
                    >
                      依頼を掲示
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModal({ type: "create" })}
                  disabled={boardDisabled}
                  className="quest-btn-primary w-full mt-2 sm:hidden disabled:opacity-50"
                >
                  依頼を掲示
                </button>
              </div>
            </div>

            {loading ? (
              <LoadingBoard />
            ) : nav === "stats" ? (
              <GuildOverview
                activeCount={activeQuests.length}
                completedCount={completedHistory.length}
                openCount={openCount}
                guildProgress={guildProgress}
                completedLog={sortedCompleted}
                activityLogs={logs}
                logsLoading={logsLoading}
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
                <EmptyState
                  nav={nav}
                  filter={quickFilter}
                  onNewQuest={() => setModal({ type: "create" })}
                />
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

        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
          <div className="rpg-frame grid grid-cols-4 max-w-lg mx-auto bg-[var(--color-panel)]">
            {(
              [
                { id: "board" as NavId, icon: "📜", label: "クエスト" },
                { id: "my" as NavId, icon: "⚔️", label: "自分" },
                { id: "stats" as NavId, icon: "🏰", label: "ギルド" },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setNav(item.id);
                  setMobilePanel("quests");
                }}
                className={`min-h-16 flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-semibold transition-colors font-[family-name:var(--font-pixel)] ${
                  nav === item.id && mobilePanel === "quests"
                    ? "nav-active"
                    : "text-slate-500"
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                {item.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setMobilePanel("party")}
              className={`min-h-16 flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-semibold border-l border-[var(--color-gold)]/15 transition-colors font-[family-name:var(--font-pixel)] ${
                mobilePanel === "party" ? "nav-active" : "text-slate-500"
              }`}
            >
              <span className="text-lg">👥</span>
              パーティ
            </button>
          </div>
        </nav>
      </div>

      <QuestFormModal
        open={modal.type !== "closed"}
        mode={modal.type === "edit" ? "edit" : "create"}
        initial={editingQuest}
        onClose={() => setModal({ type: "closed" })}
        onSubmit={modal.type === "edit" ? handleEditQuest : handleCreateQuest}
        submitting={busy}
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
        open={detail.type === "open" && detailQuest != null}
        onClose={() => setDetail({ type: "closed" })}
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
  boardDisabled,
  onCreate,
}: {
  selectedMember: PartyMember | null;
  selectedPlayer: string;
  guildProgress: {
    completedCount: number;
    exp: number;
    rankProgress: number;
  };
  boardDisabled: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="game-hud hidden lg:grid grid-cols-[minmax(18rem,1fr)_minmax(22rem,1.15fr)_minmax(18rem,1fr)_minmax(14rem,0.7fr)] gap-4 px-3 pt-3">
      <section className="rpg-frame hud-title-panel px-5 py-4 flex items-center gap-4">
        <div className="guild-crest" aria-hidden>
          ⚔
        </div>
        <div>
          <h1 className="pixel-title text-3xl font-bold gold-text">
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

      <section className="rpg-frame px-5 py-4">
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

      <button
        type="button"
        onClick={onCreate}
        disabled={boardDisabled}
        className="quest-btn-primary create-quest-command text-lg disabled:opacity-50"
      >
        依頼を掲示する
      </button>
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
    <section className="rpg-frame selected-player-panel px-5 py-3">
      <p className="pixel-title text-xs text-[var(--color-gold-bright)]">
        操作中の冒険者
      </p>
      <div className="mt-2 flex items-center gap-3">
        <div className={`hud-avatar avatar-frame-${frame}`}>
          {selectedMember?.avatar ?? "🧙"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="pixel-title text-xl text-slate-50 truncate">
              {selectedMember?.name ?? selectedPlayer ?? "未選択"}
            </p>
            <p className="pixel-title text-lg text-slate-50">
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

function MobilePlayerHud({
  selectedMember,
  selectedPlayer,
}: {
  selectedMember: PartyMember | null;
  selectedPlayer: string;
}) {
  const expProgress = selectedMember ? selectedMember.exp % 100 : 0;
  const frame = selectedMember?.avatarFrame ?? "bronze";

  return (
    <div className="mobile-player-hud mt-3 flex items-center gap-3 border-t-2 border-[var(--color-gold)]/25 pt-3">
      <div className={`hud-avatar hud-avatar-sm avatar-frame-${frame}`}>
        {selectedMember?.avatar ?? "🧙"}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="pixel-title text-sm text-slate-50 truncate">
            {selectedMember?.name ?? selectedPlayer ?? "未選択"}
          </p>
          <p className="pixel-title text-xs text-slate-50">
            Lv.{selectedMember?.level ?? "--"}
          </p>
        </div>
        <HudMeter label="EXP" value={expProgress} tone="xp" compact />
      </div>
    </div>
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

function QuestDetailModal({
  quest,
  open,
  onClose,
  onEdit,
  onDelete,
  disabled,
}: {
  quest: Quest | null;
  open: boolean;
  onClose: () => void;
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
          <DetailCell label="挑戦者" value={quest.challenger} />
          <DetailCell label="継承者1" value={quest.successor1} />
          <DetailCell label="継承者2" value={quest.successor2} />
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

function DetailCell({ label, value }: { label: string; value: string }) {
  const empty = value === "—";

  return (
    <div className="border-2 border-white/15 bg-black/20 p-3 shadow-[2px_2px_0_#000]">
      <p className="text-[10px] text-[var(--color-gold)]">{label}</p>
      <p className={empty ? "mt-1 text-sm text-slate-500" : "mt-1 text-sm text-slate-100"}>
        {value}
      </p>
    </div>
  );
}

function SettingsModal({
  open,
  currentName,
  disabled,
  onClose,
  onRename,
  onLogout,
}: {
  open: boolean;
  currentName: string;
  disabled: boolean;
  onClose: () => void;
  onRename: (name: string) => Promise<void>;
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
            onClick={onLogout}
            disabled={disabled || submitting}
            className="quest-btn-ghost w-full border-red-400/70 text-red-200 disabled:opacity-50"
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
    <div className="shrink-0 -mx-3 lg:-mx-0 px-3 lg:px-0 py-1.5 bg-[#17101a] border-y-2 border-[#fff4c4]/35">
      <div className="flex gap-2 overflow-x-auto custom-scroll pb-1" role="tablist" aria-label="クエスト絞り込み">
        <button
          type="button"
          aria-pressed={active == null}
          onClick={() => onChange(null)}
          className={`pixel-chip min-h-11 shrink-0 px-3 text-xs font-semibold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold-bright)] ${
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
              className={`pixel-chip min-h-11 shrink-0 px-3 text-xs font-semibold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold-bright)] ${
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
    <section className="recommended-quest space-y-2 p-2" aria-label="おすすめクエスト">
      <div className="flex items-center justify-between gap-3 px-1.5">
        <div>
          <p className="font-[family-name:var(--font-display)] text-[10px] tracking-[0.2em] text-[var(--color-gold)]/70">
            NEXT QUEST
          </p>
          <h3 className="pixel-window-title text-sm font-bold mt-0.5">
            ギルド特別掲示
          </h3>
          <p className="text-xs text-slate-500">{reason}</p>
        </div>
        <span className="pixel-chip hidden sm:inline-flex px-2 py-1 text-[10px] text-slate-300">
          空き枠 {openSlots}
        </span>
      </div>
      <QuestCard
        quest={quest}
        index={0}
        selectedPlayer={selectedPlayer}
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
      <div className="rpg-message-avatar" aria-hidden>
        <span>{message.icon}</span>
      </div>
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
  onNewQuest,
}: {
  nav: NavId;
  filter?: QuickFilter | null;
  onNewQuest: () => void;
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
        ? "まだ誰も挑戦していないクエストはありません。新しい依頼があれば掲示してください。"
        : filter === "succession"
          ? "現在、助っ人を募集しているクエストはありません。"
        : filter === "mine"
            ? "対応できるクエストがあれば、挑戦または継承で参加できます。"
            : nav === "my"
              ? "挑戦するか、継承者として参加してください。"
              : "ギルドに新しい依頼を掲示できます。";

  return (
    <div className="rpg-frame p-5 text-center">
      <span className="text-4xl">📜</span>
      <p className="mt-4 text-lg font-bold gold-text">
        {title}
      </p>
      <p className="text-sm text-slate-500 mt-2">
        {message}
      </p>
      {nav === "board" && (
        <button
          type="button"
          onClick={onNewQuest}
          className="quest-btn-primary mt-6"
        >
          依頼を掲示
        </button>
      )}
    </div>
  );
}

function GuildOverview({
  activeCount,
  completedCount,
  openCount,
  guildProgress,
  completedLog,
  activityLogs,
  logsLoading,
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
  completedLog: CompletedQuestEntry[];
  activityLogs: QuestLog[];
  logsLoading: boolean;
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
        <header className="mb-4 pb-3 border-b border-[var(--color-gold)]/20">
          <h3 className="pixel-window-title text-base font-semibold">ギルド進捗</h3>
          <p className="text-xs text-slate-500 mt-1">
            今日の達成がギルド全体の成長として見える場所です。
          </p>
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
