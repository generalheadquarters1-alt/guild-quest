import type { PartyMember } from "../data/quests";

const STATUS_LABEL: Record<PartyMember["status"], { text: string; color: string }> =
  {
    ready: { text: "待機中", color: "text-[var(--color-xp)]" },
    busy: { text: "挑戦中", color: "text-[var(--color-mana)]" },
    resting: { text: "休憩中", color: "text-slate-400" },
  };

const FRAME_STYLES: Record<PartyMember["avatarFrame"], string> = {
  bronze: "avatar-frame-bronze bg-amber-950/30",
  silver: "avatar-frame-silver bg-slate-400/10",
  gold: "avatar-frame-gold bg-[var(--color-gold)]/14",
  platinum: "avatar-frame-platinum bg-cyan-300/10",
};

interface PartyPanelProps {
  staff: PartyMember[];
  loading: boolean;
  selectedPlayer: string;
  onSelectPlayer: (name: string) => void;
  className?: string;
}

export function PartyPanel({
  staff,
  loading,
  selectedPlayer,
  onSelectPlayer,
  className = "",
}: PartyPanelProps) {
  return (
    <aside className={`rpg-frame p-4 flex flex-col ${className}`}>
      <header className="mb-4 pb-3 border-b border-[var(--color-gold)]/20">
        <div className="flex items-center justify-between gap-3">
          <h2 className="pixel-window-title text-base sm:text-lg font-semibold">
            冒険者パーティ
          </h2>
          <span className="pixel-chip px-2 py-1 text-xs text-slate-300">
            {staff.length} / 10
          </span>
        </div>
        <p className="text-[10px] text-slate-500 mt-1 tracking-wider">
          操作する冒険者を選択
        </p>
      </header>

      {loading ? (
        <div className="flex flex-col gap-3 flex-1">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 border-2 border-white/20 bg-white/5 animate-pulse shadow-[3px_3px_0_#000]" />
          ))}
        </div>
      ) : staff.length === 0 ? (
        <p className="text-sm text-slate-500 py-4 text-center">
          ギルド名簿にスタッフが登録されていません。migration 002を実行してください。
        </p>
      ) : (
        <ul className="flex flex-col gap-3 flex-1 custom-scroll overflow-y-auto max-h-[50vh] lg:max-h-none">
          {staff.map((member, i) => {
            const isSelected = member.name === selectedPlayer;
            const expProgress = member.exp % 100;
            return (
              <li key={member.id}>
                <button
                  type="button"
                  onClick={() => onSelectPlayer(member.name)}
                  className={`party-member-card group tap-card pixel-menu-button w-full p-3 border text-left transition-all duration-300 animate-fade-up ${
                    isSelected
                      ? "is-selected pl-7"
                      : "border-white/20 bg-black/20 hover:border-[var(--color-gold)]/60 hover:bg-[var(--color-panel)]/80"
                  }`}
                  style={{
                    animationDelay: `${200 + i * 60}ms`,
                    animationFillMode: "both",
                  }}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div
                      className={`pixel-avatar w-11 h-11 border-2 flex items-center justify-center text-lg transition-transform ${FRAME_STYLES[member.avatarFrame]} ${
                        isSelected
                          ? "scale-105"
                          : "group-hover:scale-105"
                      }`}
                    >
                      {member.avatar}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-100 truncate">
                        Lv {member.level} {member.name}
                        {isSelected && (
                          <span className="ml-1.5 text-[10px] text-[var(--color-gold-bright)]">
                            選択中
                          </span>
                        )}
                      </p>
                      <p className="text-[10px] text-[var(--color-gold-dim)] truncate">
                        {member.title} · {member.role}
                      </p>
                    </div>
                    <span
                      className={`text-[10px] font-medium ${STATUS_LABEL[member.status].color}`}
                    >
                      {STATUS_LABEL[member.status].text}
                    </span>
                  </div>
                  <Bar
                    label={`EXP ${expProgress}/100`}
                    value={expProgress}
                    color="from-[var(--color-gold-dim)] to-[var(--color-gold-bright)]"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Bar
                      label="HP"
                      value={member.hp}
                      color="from-red-600 to-[var(--color-hp)]"
                    />
                    <Bar
                      label="MP"
                      value={member.mp}
                      color="from-blue-700 to-[var(--color-mana)]"
                    />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <footer className="mt-4 pt-3 border-t border-[var(--color-gold)]/15 text-center">
        <p className="text-[10px] text-slate-500 tracking-wider">
          操作中の冒険者
        </p>
        <p className="pixel-title text-lg font-semibold gold-text mt-1 truncate px-2">
          {selectedPlayer || "—"}
        </p>
      </footer>
    </aside>
  );
}

function Bar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="mt-1.5">
      <div className="flex justify-between text-[9px] text-slate-500 mb-0.5">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="h-2 border border-white/20 bg-black/60 overflow-hidden">
        <div
          className={`h-full bg-gradient-to-r ${color} transition-all duration-500`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}
