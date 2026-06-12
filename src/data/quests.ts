export type Priority = "S" | "A" | "B" | "C";
export type QuestLevel = "Novice" | "Easy" | "Normal" | "Hard" | "Legend";
export type QuestDifficulty = 1 | 2 | 3 | 4 | 5;
export type QuestStatus =
  | "open"
  | "recruiting"
  | "in_progress"
  | "help_wanted"
  | "completed";

export const QUEST_DIFFICULTY_LABELS: Record<QuestDifficulty, string> = {
  1: "見習い",
  2: "易",
  3: "標準",
  4: "難",
  5: "伝説",
};

export const QUEST_LEVEL_BY_DIFFICULTY: Record<QuestDifficulty, QuestLevel> = {
  1: "Novice",
  2: "Easy",
  3: "Normal",
  4: "Hard",
  5: "Legend",
};

export const QUEST_DIFFICULTY_BY_LEVEL: Record<QuestLevel, QuestDifficulty> = {
  Novice: 1,
  Easy: 2,
  Normal: 3,
  Hard: 4,
  Legend: 5,
};

export const ESTIMATED_MINUTE_OPTIONS = [
  { value: 15, label: "15分" },
  { value: 30, label: "30分" },
  { value: 60, label: "1時間" },
  { value: 120, label: "2時間" },
  { value: 180, label: "3時間" },
  { value: 240, label: "半日" },
  { value: 480, label: "終日" },
] as const;

export interface Quest {
  id: number;
  requester: string;
  title: string;
  level: QuestLevel;
  difficulty: QuestDifficulty;
  priority: Priority;
  urgency: number;
  importance: number;
  estimatedTime: string;
  estimatedMinutes: number | null;
  dueAt: string | null;
  description: string;
  challenger: string;
  successor1: string;
  successor2: string;
  requiredMembers: number;
  participants: string[];
  status: QuestStatus;
  createdAt?: string;
  completedAt?: string | null;
  linkedEventId?: number | null;
}

export interface CompletedQuestEntry {
  quest: Quest;
  completedAt: string;
}

export interface PartyMember {
  id: string;
  name: string;
  role: string;
  roleLevel: "adventurer" | "sub_master" | "guild_master";
  hp: number;
  mp: number;
  status: "ready" | "busy" | "resting";
  avatar: string;
  avatarType: string;
  level: number;
  exp: number;
  title: string;
  avatarFrame: "bronze" | "silver" | "gold" | "platinum";
  isActive?: boolean;
}

export const EMPTY_SLOT = "—";

export const GUILD_STATS = {
  questsCleared: 127,
  guildRank: "Platinum IV",
  weeklyXp: 2840,
  morale: 87,
};
