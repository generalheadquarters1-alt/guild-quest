import type { PartyMember } from "../data/quests";

const STATUS_LABEL: Record<PartyMember["status"], { text: string; color: string }> =
  {
    ready: { text: "待機中", color: "text-[var(--color-xp)]" },
    busy: { text: "挑戦中", color: "text-[var(--color-mana)]" },
    resting: { text: "休憩中", color: "text-slate-400" },
  };

const FRAME_STYLES: Record<PartyMember["avatarFrame"], string> = {
  bronze: "border-amber-700/70 bg-amber-950/30",
  silver: "border-slate-300/70 bg-slate-400/10",
  gold: "border-[var(--color-gold-bright)] bg-[var(--color-gold)]/14 shadow-[0_0_18px_rgba(212,168,83,0.24)]",
  platinum: "border-cyan-200/80 bg-cyan-300/10 shadow-[0_0_20px_rgba(125,211,252,0.26)]",
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
    <aside className={`rpg-frame rounded-xl p-4 flex flex-col ${className}`}>
      <header className="mb-4 pb-3 border-b border-[var(--color-gold)]/20">
        <h2 className="text-base sm:text-lg font-semibold gold-text flex items-center gap-2">
          <span>👥</span> パーティ状況
        </h2>
        <p className="text-[10px] text-slate-500 mt-1 tracking-wider">
          操作するメンバーを選択
        </p>
      </header>

      {loading ? (
        <div className="flex flex-col gap-3 flex-1">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-lg bg-white/5 animate-pulse" />
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
                  className={`group tap-card w-full p-3 rounded-lg border text-left transition-all duration-300 animate-fade-up ${
                    isSelected
                      ? "border-[var(--color-gold-bright)]/75 bg-[var(--color-gold)]/14 shadow-[0_0_0_1px_rgba(240,208,120,0.18)_inset,0_0_26px_rgba(212,168,83,0.2)]"
                      : "border-white/5 bg-black/20 hover:border-[var(--color-gold)]/30 hover:bg-[var(--color-panel)]/50"
                  }`}
                  style={{
                    animationDelay: `${200 + i * 60}ms`,
                    animationFillMode: "both",
                  }}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div
                      className={`w-11 h-11 rounded-lg border-2 flex items-center justify-center text-lg transition-transform ${FRAME_STYLES[member.avatarFrame]} ${
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
                            ★ 選択中
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
          操作中メンバー
        </p>
        <p className="text-lg font-semibold gold-text mt-1 truncate px-2">
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
      <div className="h-1 rounded-full bg-black/50 overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-500`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}
