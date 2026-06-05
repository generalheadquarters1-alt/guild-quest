import { GUILD_STATS } from "../data/quests";

type NavId = "board" | "my" | "stats";

interface SidebarProps {
  active: NavId;
  onNavigate: (id: NavId) => void;
  myQuestCount: number;
  activeQuestCount: number;
  className?: string;
}

export function Sidebar({
  active,
  onNavigate,
  myQuestCount,
  activeQuestCount,
  className = "",
}: SidebarProps) {
  const NAV: { id: NavId; icon: string; label: string; sub: string }[] = [
    { id: "board", icon: "📋", label: "クエストボード", sub: "QUEST BOARD" },
    { id: "my", icon: "🗡️", label: "自分のクエスト", sub: `進行中 ${myQuestCount}` },
    { id: "stats", icon: "🏰", label: "ギルド実績", sub: "GUILD RECORD" },
  ];

  return (
    <aside
      className={`rpg-frame rounded-xl p-4 flex flex-col gap-4 ${className}`}
    >
      <div className="text-center pb-3 border-b border-[var(--color-gold)]/20">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full border-2 border-[var(--color-gold)]/50 bg-[var(--color-deep)] mb-2 animate-pulse-glow shadow-[0_0_20px_rgba(212,168,83,0.2)]">
          <span className="text-2xl">⚔️</span>
        </div>
        <h1 className="font-[family-name:var(--font-display)] text-lg sm:text-xl font-bold gold-text tracking-wide">
          ギルドクエスト
        </h1>
        <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-[0.2em]">
          GUILD BOARD
        </p>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            className={`group flex items-center gap-3 w-full px-3 py-3 rounded-lg text-left transition-all duration-200 ${
              active === item.id
                ? "bg-[var(--color-gold)]/15 border border-[var(--color-gold)]/40 text-[var(--color-gold-bright)]"
                : "border border-transparent hover:bg-white/5 hover:border-[var(--color-gold)]/20"
            }`}
          >
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
            {active === item.id && (
              <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[var(--color-gold-bright)] shadow-[0_0_8px_var(--color-gold)]" />
            )}
          </button>
        ))}
      </nav>

      <div className="mt-auto space-y-3 pt-3 border-t border-[var(--color-gold)]/15">
        <h2 className="text-xs font-bold text-[var(--color-gold)] tracking-widest">
          ギルド実績
        </h2>
        <StatRow label="討伐数" value={String(GUILD_STATS.questsCleared)} />
        <StatRow label="進行中" value={String(activeQuestCount)} />
        <StatRow label="ランク" value={GUILD_STATS.guildRank} highlight />
        <div>
          <div className="flex justify-between text-[10px] mb-1">
            <span className="text-slate-500">今週のXP</span>
            <span className="text-[var(--color-xp)]">
              {GUILD_STATS.weeklyXp.toLocaleString()}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-black/40 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[var(--color-gold-dim)] to-[var(--color-gold-bright)] transition-all duration-700"
              style={{ width: "72%" }}
            />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-[10px] mb-1">
            <span className="text-slate-500">士気</span>
            <span>{GUILD_STATS.morale}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-black/40 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[var(--color-hp)] to-[var(--color-mana)]"
              style={{ width: `${GUILD_STATS.morale}%` }}
            />
          </div>
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
