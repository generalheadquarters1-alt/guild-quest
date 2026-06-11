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
type SidebarFilter = "succession" | null;

interface SidebarProps {
  active: NavId;
  onNavigate: (id: NavId) => void;
  quickFilter: SidebarFilter | string | null;
  onQuickFilter: (filter: SidebarFilter) => void;
  myQuestCount: number;
  activeQuestCount: number;
  onOpenGuide: () => void;
  className?: string;
}

export function Sidebar({
  active,
  onNavigate,
  quickFilter,
  onQuickFilter,
  myQuestCount,
  activeQuestCount,
  onOpenGuide,
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
      key: "notebook",
      icon: "📔",
      label: "冒険者手帳",
      sub: "本日の任務",
      selected: active === "notebook",
      onSelect: () => {
        onNavigate("notebook");
        onQuickFilter(null);
      },
    },
    {
      key: "notices",
      icon: "⚠",
      label: "気付きの書",
      sub: "NOTICE",
      selected: active === "notices",
      onSelect: () => {
        onNavigate("notices");
        onQuickFilter(null);
      },
    },
    {
      key: "board",
      icon: "📜",
      label: "ギルド依頼",
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
      key: "expedition",
      icon: "🧭",
      label: "遠征",
      sub: "TICKET",
      selected: active === "expedition",
      onSelect: () => {
        onNavigate("expedition");
        onQuickFilter(null);
      },
    },
    {
      key: "calendar",
      icon: "📅",
      label: "ギルド暦",
      sub: "CALENDAR",
      selected: active === "calendar",
      onSelect: () => {
        onNavigate("calendar");
        onQuickFilter(null);
      },
    },
    {
      key: "adventure",
      icon: "📖",
      label: "冒険の記録",
      sub: "EVENT LOG",
      selected: active === "activity",
      onSelect: () => {
        onNavigate("activity");
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
    {
      key: "settings",
      icon: "⚙",
      label: "設定",
      sub: "SYSTEM",
      selected: active === "settings",
      onSelect: () => {
        onNavigate("settings");
        onQuickFilter(null);
      },
    },
    {
      key: "guide",
      icon: "?",
      label: "初回ガイド",
      sub: "HELP",
      selected: false,
      onSelect: onOpenGuide,
    },
  ];

  return (
    <aside
      className={`rpg-frame p-3 flex flex-col gap-3 ${className}`}
    >
      <div className="pb-2 border-b border-[var(--color-gold)]/20">
        <h2 className="pixel-window-title text-sm font-bold">MENU</h2>
        <p className="mt-1 text-[10px] text-slate-500">
          依頼 {activeQuestCount}件 / 自分 {myQuestCount}件
        </p>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto custom-scroll pr-1">
        {NAV.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={item.onSelect}
            className={`group pixel-menu-button flex min-h-11 w-full cursor-pointer items-center gap-3 px-3 py-3 text-left transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold-bright)] ${
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
    </aside>
  );
}
