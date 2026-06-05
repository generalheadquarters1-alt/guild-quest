import { GUILD_STATS } from "../data/quests";

type NavId = "board" | "my" | "stats";
type SidebarFilter = "succession" | null;

interface SidebarProps {
  active: NavId;
  onNavigate: (id: NavId) => void;
  quickFilter: SidebarFilter | string | null;
  onQuickFilter: (filter: SidebarFilter) => void;
  myQuestCount: number;
  activeQuestCount: number;
  onLogout: () => void;
  onOpenSettings: () => void;
  className?: string;
}

export function Sidebar({
  active,
  onNavigate,
  quickFilter,
  onQuickFilter,
  myQuestCount,
  activeQuestCount,
  onLogout,
  onOpenSettings,
  className = "",
}: SidebarProps) {
  const NAV: Array<{
    key: string;
    icon: string;
    label: string;
    sub: string;
    selected: boolean;
    onSelect: () => void;
  }> = [
    {
      key: "board",
      icon: "📜",
      label: "クエスト掲示板",
      sub: "QUEST BOARD",
      selected: active === "board" && quickFilter == null,
      onSelect: () => {
        onNavigate("board");
        onQuickFilter(null);
      },
    },
    {
      key: "my",
      icon: "⚔️",
      label: "自分の依頼",
      sub: `進行中 ${myQuestCount}`,
      selected: active === "my",
      onSelect: () => {
        onNavigate("my");
        onQuickFilter(null);
      },
    },
    {
      key: "succession",
      icon: "🛡️",
      label: "助っ人募集",
      sub: "HELP WANTED",
      selected: active === "board" && quickFilter === "succession",
      onSelect: () => {
        onNavigate("board");
        onQuickFilter("succession");
      },
    },
    {
      key: "adventure",
      icon: "📖",
      label: "冒険の記録",
      sub: "EVENT LOG",
      selected: false,
      onSelect: () => {
        onNavigate("stats");
        onQuickFilter(null);
      },
    },
    {
      key: "stats",
      icon: "🏰",
      label: "ギルドの記録",
      sub: "GUILD RECORD",
      selected: active === "stats",
      onSelect: () => {
        onNavigate("stats");
        onQuickFilter(null);
      },
    },
  ];

  return (
    <aside
      className={`rpg-frame p-4 flex flex-col gap-4 ${className}`}
    >
      <div className="text-center pb-3 border-b border-[var(--color-gold)]/20">
        <div className="inline-flex items-center justify-center w-14 h-14 border-2 border-[var(--color-gold-bright)] bg-[var(--color-deep)] mb-2 animate-pulse-glow shadow-[3px_3px_0_#000]">
          <span className="text-2xl">⚔️</span>
        </div>
        <h1 className="pixel-title text-lg sm:text-xl font-bold gold-text">
          ギルドクエスト
        </h1>
        <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-[0.2em]">
          GUILD BOARD
        </p>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={item.onSelect}
            className={`group pixel-menu-button flex items-center gap-3 w-full px-3 py-3 text-left transition-all duration-200 ${
              item.selected ? "is-selected" : ""
            }`}
          >
            <span className="w-4 text-xs" aria-hidden />
            <span className="text-xl transition-transform group-hover:scale-110">
              {item.icon}
            </span>
            <div className="min-w-0">
              <span className="block text-sm font-medium truncate">
                {item.label}
              </span>
              <span className="block text-[10px] text-slate-500">
                {item.sub}
              </span>
            </div>
          </button>
        ))}
      </nav>

      <div className="mt-auto space-y-3 pt-3 border-t border-[var(--color-gold)]/15">
        <h2 className="pixel-window-title text-xs font-bold">
          ギルドの記録
        </h2>
        <StatRow label="討伐数" value={String(GUILD_STATS.questsCleared)} />
        <StatRow label="進行中" value={String(activeQuestCount)} />
        <StatRow label="ランク" value={GUILD_STATS.guildRank} highlight />
        <div>
          <div className="flex justify-between text-[10px] mb-1">
            <span className="text-slate-500">今週のEXP</span>
            <span className="text-[var(--color-xp)]">
              {GUILD_STATS.weeklyXp.toLocaleString()}
            </span>
          </div>
          <div className="h-2 border border-white/20 bg-black/60 overflow-hidden">
            <div className="h-full bg-[var(--color-gold-bright)] transition-all duration-700" style={{ width: "72%" }} />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-[10px] mb-1">
            <span className="text-slate-500">士気</span>
            <span>{GUILD_STATS.morale}%</span>
          </div>
          <div className="h-2 border border-white/20 bg-black/60 overflow-hidden">
            <div className="h-full bg-[var(--color-xp)]" style={{ width: `${GUILD_STATS.morale}%` }} />
          </div>
        </div>
        <div className="pt-3 border-t border-[var(--color-gold)]/15">
          <h2 className="pixel-window-title text-xs font-bold">
            設定
          </h2>
          <button
            type="button"
            onClick={onOpenSettings}
            className="quest-btn-ghost w-full mt-2"
          >
            冒険者名を変更
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="quest-btn-ghost w-full mt-2"
          >
            ギルドから退出
          </button>
        </div>
      </div>
    </aside>
  );
}

function StatRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-slate-500 text-xs">{label}</span>
      <span
        className={
          highlight
            ? "text-[var(--color-gold-bright)] text-xs font-bold"
            : "text-slate-200 font-medium"
        }
      >
        {value}
      </span>
    </div>
  );
}
