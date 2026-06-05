import { useEffect, useMemo, useState, type CSSProperties } from "react";
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
import type { CompletedQuestEntry, Quest } from "./data/quests";
import type { QuestLog } from "./lib/questLogApi";
import { useQuestLogs } from "./hooks/useQuestLogs";
import { useQuests } from "./hooks/useQuests";
import { useStaff } from "./hooks/useStaff";
import { partitionQuests } from "./lib/questMapper";
import {
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
type CompletionReward = {
  title: string;
  exp: number;
  coins: number;
};
const GUIDE_STORAGE_KEY = "todo-quest-guide-seen";

type ModalState =
  | { type: "closed" }
  | { type: "create" }
  | { type: "edit"; questId: number };

type ConfirmState =
  | { type: "closed" }
  | { type: "complete"; questId: number }
  | { type: "delete"; questId: number };

type ReopenState = { type: "closed" } | { type: "open"; questId: number };

export default function App() {
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
  const [quickFilter, setQuickFilter] = useState<QuickFilter | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
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

  const runAction = async <T,>(
    key: string,
    fn: () => Promise<T>,
    successMessage: string,
    onSuccess?: (result: T) => void,
  ) => {
    if (pendingAction) return;
    setActionError(null);
    setPendingAction(key);
    try {
      const result = await fn();
      onSuccess?.(result);
      addToast(successMessage);
    } catch (e) {
      const message = "通信に失敗しました。少し時間を置いて再度お試しください。";
      setActionError(message);
      addToast(message, "error");
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
      "受注しました。担当者に登録されています。",
    );
  };

  const handleBecomeSuccessor = (questId: number) => {
    const quest = findQuest(questId);
    if (!quest || !selectedPlayer) return;
    void runAction(
      `successor-${questId}`,
      () => becomeSuccessor(quest, selectedPlayer),
      "継承者として参加しました。",
    );
  };

  const handleRequestSuccession = (questId: number) => {
    const quest = findQuest(questId);
    if (!quest || !selectedPlayer) return;
    void runAction(
      `succession-${questId}`,
      () => requestSuccession(quest, selectedPlayer),
      "継承募集を掲示しました。",
    );
  };

  const handleCreateQuest = (data: QuestFormData) => {
    if (!selectedPlayer) return;
    void runAction(
      "create",
      () => insertQuest(data, selectedPlayer),
      "新規クエストを掲示しました。",
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
    setConfirm({ type: "closed" });
    void runAction(
      `complete-${quest.id}`,
      () => completeQuest(quest, selectedPlayer),
      "討伐完了。完了ログに記録しました。",
      () => {
        setCompletionBurst({ title: quest.title, exp, coins });
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
      "クエストを削除しました。",
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

  const boardDisabled =
    busy || loading || staffLoading || !selectedPlayer || !isOnline;

  if (!isSupabaseConfigured) {
    return <ConfigError />;
  }

  return (
    <div className="quest-bg min-h-dvh relative">
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

      <div className="relative z-10 flex flex-col min-h-dvh max-w-[1600px] mx-auto">
        {(!isOnline || error || actionError) && (
          <div className="mx-4 mt-3 lg:mx-4 lg:mt-0 px-4 py-2 rounded-lg border border-red-400/40 bg-red-500/10 text-red-200 text-xs sm:text-sm flex flex-wrap items-center justify-between gap-2">
            <span>
              {!isOnline
                ? "通信がオフラインのようです。接続が戻るまで操作を一時停止しています。"
                : actionError ?? "通信に失敗しました。少し時間を置いて再度お試しください。"}
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

        <header className="lg:hidden sticky top-0 z-20 px-4 py-3 backdrop-blur-md bg-[var(--color-void)]/88 border-b border-[var(--color-gold)]/20">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h1 className="font-[family-name:var(--font-display)] text-lg font-bold gold-text">
                ギルドクエスト
              </h1>
              <p className="text-[10px] text-slate-400 tracking-wider truncate">
                操作中: <span className="text-[var(--color-gold-bright)]">{selectedPlayer || "未選択"}</span>
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
                onClick={() => setModal({ type: "create" })}
                disabled={boardDisabled}
                className="quest-btn-primary text-xs px-3 py-2 disabled:opacity-50"
              >
                新規
              </button>
            </div>
          </div>
        </header>

        <div className="flex-1 flex flex-col lg:flex-row gap-0 lg:gap-4 p-0 lg:p-4">
          <Sidebar
            active={nav}
            onNavigate={setNav}
            myQuestCount={myQuestCount}
            activeQuestCount={activeQuests.length}
            className="hidden lg:flex lg:w-56 xl:w-64 shrink-0"
          />

          <main
            className={`flex-1 flex flex-col min-w-0 px-4 py-4 lg:py-0 ${
              mobilePanel === "party" ? "hidden lg:flex" : "flex"
            }`}
          >
            <div className="mb-4 lg:mb-5">
              <div className="rpg-frame board-hero rounded-xl px-4 py-3 sm:px-5 sm:py-4 overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-[family-name:var(--font-display)] text-[10px] tracking-[0.24em] text-[var(--color-gold)]/80">
                      GUILD BOARD
                    </p>
                    <h2 className="text-lg sm:text-2xl font-bold gold-text">
                      {nav === "board"
                        ? "クエストボード"
                        : nav === "my"
                          ? "自分のクエスト"
                          : "ギルド実績"}
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {nav === "stats"
                        ? "ギルドの戦況 · Supabase 同期"
                        : `${quickFilter === "completed" ? sortedCompleted.length : sortedActive.length}件表示 · 操作中 ${selectedPlayer || "未選択"}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex flex-wrap gap-2 text-[10px] sm:text-xs">
                      {urgentCount > 0 && (
                        <span className="px-2 py-1 rounded border border-red-400/40 text-red-300 bg-red-500/10">
                          緊急×{urgentCount}
                        </span>
                      )}
                      {openCount > 0 && (
                        <span className="px-2 py-1 rounded border border-[var(--color-gold)]/40 text-[var(--color-gold)] bg-[var(--color-gold)]/10">
                          未受注×{openCount}
                        </span>
                      )}
                      {successionCount > 0 && (
                        <span className="px-2 py-1 rounded border border-[var(--color-rare)]/40 text-[var(--color-rare)] bg-[var(--color-rare)]/10">
                          継承募集×{successionCount}
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
                      新規クエスト
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModal({ type: "create" })}
                  disabled={boardDisabled}
                  className="quest-btn-primary w-full mt-3 sm:hidden disabled:opacity-50"
                >
                  新規クエスト
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
              <div className="space-y-4 pb-24 lg:pb-4">
                <QuickFilters
                  active={quickFilter}
                  counts={filterCounts}
                  onChange={setQuickFilter}
                />
                <section className="rpg-frame rounded-xl p-4 sm:p-5">
                  <header className="mb-4 pb-3 border-b border-[var(--color-gold)]/20">
                    <h3 className="text-base font-semibold gold-text">
                      達成ログ
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      達成したクエストを確認できます。
                    </p>
                  </header>
                  <CompletedQuestLog
                    entries={sortedCompleted}
                    onReopen={(id) => setReopen({ type: "open", questId: id })}
                    onDelete={(id) => setConfirm({ type: "delete", questId: id })}
                  />
                </section>
              </div>
            ) : sortedActive.length === 0 ? (
              <div className="space-y-4">
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
              <div
                className={`flex flex-col gap-4 custom-scroll overflow-y-auto pb-24 lg:pb-4 ${busy ? "opacity-80 pointer-events-none" : ""}`}
              >
                <QuickFilters
                  active={quickFilter}
                  counts={filterCounts}
                  onChange={setQuickFilter}
                />
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
                  />
                )}
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
                    disabled={busy || !isOnline}
                  />
                ))}
              </div>
            )}
          </main>

          <PartyPanel
            staff={staff}
            loading={staffLoading}
            selectedPlayer={selectedPlayer}
            onSelectPlayer={setSelectedPlayer}
            className={`lg:w-64 xl:w-72 shrink-0 mx-4 mb-4 lg:mx-0 lg:mb-0 ${
              mobilePanel === "quests" ? "hidden lg:flex" : "flex"
            }`}
          />
        </div>

        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-[var(--color-gold)]/25 bg-[var(--color-abyss)]/95 backdrop-blur-lg pb-[env(safe-area-inset-bottom)]">
          <div className="grid grid-cols-5 max-w-lg mx-auto">
            {(
              [
                { id: "board" as NavId, icon: "📋", label: "ボード" },
                { id: "my" as NavId, icon: "🗡️", label: "自分" },
                { id: "stats" as NavId, icon: "🏰", label: "統計" },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setNav(item.id);
                  setMobilePanel("quests");
                }}
                className={`min-h-16 flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-semibold transition-colors ${
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
              className={`col-span-2 min-h-16 flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-semibold border-l border-[var(--color-gold)]/15 transition-colors ${
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

      <ToastStack toasts={toasts} />
      {completionBurst && <CompletionBurst reward={completionBurst} />}
      <GuideModal open={guideOpen} onClose={closeGuide} />
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
    { id: "succession", label: "継承募集" },
    { id: "mine", label: "自分のクエスト" },
    { id: "completed", label: "達成済み" },
  ];

  return (
    <div className="sticky top-[65px] lg:top-0 z-10 -mx-4 px-4 py-2 bg-[var(--color-void)]/86 backdrop-blur-md border-y border-[var(--color-gold)]/10">
      <div className="flex gap-2 overflow-x-auto custom-scroll pb-1" role="tablist" aria-label="クエスト絞り込み">
        <button
          type="button"
          aria-pressed={active == null}
          onClick={() => onChange(null)}
          className={`min-h-11 shrink-0 rounded-full border px-3 text-xs font-semibold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold-bright)] ${
            active == null
              ? "border-[var(--color-gold-bright)] bg-[var(--color-gold)]/18 text-[var(--color-gold-bright)] shadow-[0_0_18px_rgba(212,168,83,0.18)]"
              : "border-white/10 bg-black/25 text-slate-300 hover:border-[var(--color-gold)]/40"
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
              className={`min-h-11 shrink-0 rounded-full border px-3 text-xs font-semibold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold-bright)] ${
                selected
                  ? "border-[var(--color-gold-bright)] bg-[var(--color-gold)]/18 text-[var(--color-gold-bright)] shadow-[0_0_18px_rgba(212,168,83,0.18)]"
                  : "border-white/10 bg-black/25 text-slate-300 hover:border-[var(--color-gold)]/40"
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
    <section className="recommended-quest space-y-2 rounded-xl border border-[var(--color-gold)]/18 bg-black/16 p-2" aria-label="次におすすめのクエスト">
      <div className="flex items-center justify-between gap-3 px-1.5">
        <div>
          <p className="font-[family-name:var(--font-display)] text-[10px] tracking-[0.2em] text-[var(--color-gold)]/70">
            NEXT QUEST
          </p>
          <h3 className="text-sm font-bold gold-text mt-0.5">
            おすすめクエスト
          </h3>
          <p className="text-xs text-slate-500">{reason}</p>
        </div>
        <span className="hidden sm:inline-flex rounded-full border border-[var(--color-gold)]/25 px-2 py-1 text-[10px] text-slate-400">
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
      className="fixed right-3 bottom-20 sm:bottom-auto sm:top-3 z-[80] flex w-[min(92vw,22rem)] flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast-enter rounded-lg border px-4 py-3 text-sm shadow-2xl backdrop-blur-md ${
            toast.tone === "error"
              ? "border-red-400/40 bg-red-950/90 text-red-100"
              : toast.tone === "info"
                ? "border-[var(--color-mana)]/35 bg-[var(--color-abyss)]/95 text-slate-100"
                : "border-[var(--color-gold)]/35 bg-[var(--color-abyss)]/95 text-slate-100"
          }`}
        >
          {toast.message}
        </div>
      ))}
    </div>
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
      text: "右下の「パーティ」から自分を選ぶと、受注・継承・完了操作が自分名義になります。",
    },
    {
      title: "迷ったらおすすめを見る",
      text: "ボード上部のおすすめは、未受注または継承募集の中から優先度が高いものを表示します。",
    },
    {
      title: "状態で素早く絞り込み",
      text: "未受注、緊急、継承募集、自分のクエスト、達成済みを1タップで切り替えられます。",
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
        className="modal-backdrop absolute inset-0 bg-black/75 backdrop-blur-sm"
        aria-label="初回ガイドを閉じる"
        onClick={onClose}
      />
      <div className="modal-panel relative rpg-frame w-full max-w-md rounded-t-2xl sm:rounded-xl p-5">
        <p className="font-[family-name:var(--font-display)] text-[10px] tracking-[0.22em] text-[var(--color-gold)]/80">
          QUICK START
        </p>
        <h2 id="guide-title" className="mt-1 text-xl font-bold gold-text">
          初回ガイド
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          毎日の作業をクエストとして扱うための、最小限の使い方です。
        </p>
        <div className="mt-4 space-y-3">
          {items.map((item, index) => (
            <section
              key={item.title}
              className="rounded-lg border border-white/8 bg-black/22 p-3"
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
    <div className="pointer-events-none fixed inset-x-0 top-24 z-[70] flex justify-center px-4">
      <div className="completion-burst reward-panel relative overflow-hidden rounded-xl border border-[var(--color-xp)]/50 bg-[var(--color-abyss)]/95 px-5 py-4 text-center shadow-2xl">
        <div className="reward-sparkles" aria-hidden>
          {[...Array(10)].map((_, i) => (
            <span key={i} style={{ "--i": i } as CSSProperties} />
          ))}
        </div>
        <p className="text-base font-bold text-[var(--color-xp)]">
          クエスト達成！
        </p>
        <p className="mt-1 max-w-[18rem] truncate text-xs text-slate-300">
          {reward.title}
        </p>
        <div className="mt-3 flex justify-center gap-2 text-xs font-bold">
          <span className="rounded-full border border-[var(--color-gold)]/35 bg-[var(--color-gold)]/12 px-3 py-1 text-[var(--color-gold-bright)]">
            宝箱 +{reward.coins}G
          </span>
          <span className="rounded-full border border-[var(--color-mana)]/35 bg-[var(--color-mana)]/10 px-3 py-1 text-[var(--color-mana)]">
            EXP +{reward.exp}
          </span>
        </div>
      </div>
    </div>
  );
}

function ConfigError() {
  return (
    <div className="quest-bg min-h-dvh flex items-center justify-center p-6">
      <div className="rpg-frame rounded-xl p-8 max-w-md text-center">
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
    <div className="flex flex-col gap-4 pb-24 lg:pb-4">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="rpg-frame rounded-lg p-4 h-40 bg-white/5 overflow-hidden"
        >
          <div className="h-4 w-24 rounded bg-white/10 animate-pulse" />
          <div className="mt-4 h-5 w-3/4 rounded bg-white/10 animate-pulse" />
          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="h-8 rounded bg-white/10 animate-pulse" />
            <div className="h-8 rounded bg-white/10 animate-pulse" />
            <div className="h-8 rounded bg-white/10 animate-pulse" />
          </div>
          <div className="mt-4 h-10 rounded bg-white/10 animate-pulse" />
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
          ? "継承募集はありません"
          : filter === "mine"
            ? "自分のクエストはありません"
            : nav === "my"
              ? "担当中のクエストはありません"
              : "クエストボードは平穏です";
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
    <div className="rpg-frame rounded-xl p-8 text-center pb-24 lg:pb-8">
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
          新規クエスト
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
      className={`pb-24 lg:pb-4 space-y-6 ${busy ? "opacity-80 pointer-events-none" : ""}`}
    >
      <section className="rpg-frame rounded-xl p-4 sm:p-5">
        <header className="mb-4 pb-3 border-b border-[var(--color-gold)]/20">
          <h3 className="text-base font-semibold gold-text">ギルド進捗</h3>
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
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-black/40">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[var(--color-gold-dim)] via-[var(--color-gold)] to-[var(--color-gold-bright)] transition-all duration-700"
              style={{ width: `${guildProgress.rankProgress}%` }}
            />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className="rpg-frame rounded-lg p-4 text-center animate-fade-up hover:border-[var(--color-gold)]/50 transition-colors"
            style={{
              animationDelay: `${i * 60}ms`,
              animationFillMode: "both",
            }}
          >
            <span className="text-2xl">{s.icon}</span>
            <p className="text-[10px] text-slate-500 mt-2 tracking-wider">
              {s.label}
            </p>
            <p className="font-[family-name:var(--font-display)] text-lg sm:text-xl gold-text mt-1">
              {s.value}
            </p>
          </div>
        ))}
      </div>

      <section className="rpg-frame rounded-xl p-4 sm:p-5">
        <header className="mb-3 pb-3 border-b border-[var(--color-gold)]/20">
          <h3 className="text-sm font-semibold gold-text flex items-center gap-2">
            <span>📜</span> 冒険の記録
          </h3>
          <p className="text-[10px] text-slate-500 mt-1">
            最近のギルド活動 · リアルタイム同期
          </p>
        </header>
        <ActivityLog logs={activityLogs} loading={logsLoading} />
      </section>

      <section className="rpg-frame rounded-xl p-4 sm:p-5">
        <header className="mb-4 pb-3 border-b border-[var(--color-gold)]/20">
          <h3 className="text-base sm:text-lg font-semibold gold-text flex items-center gap-2">
            <span>📖</span> 達成ログ
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
    <div className="rounded-lg border border-white/8 bg-black/20 p-3">
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-[var(--color-gold-bright)]">
        {value}
      </p>
    </div>
  );
}
