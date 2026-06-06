export type Priority = "S" | "A" | "B" | "C";
export type QuestLevel = "Novice" | "Easy" | "Normal" | "Hard" | "Legend";
export type QuestStatus =
  | "open"
  | "in_progress"
  | "succession_needed"
  | "completed";

export interface Quest {
  id: number;
  requester: string;
  title: string;
  level: QuestLevel;
  priority: Priority;
  urgency: number;
  importance: number;
  estimatedTime: string;
  description: string;
  challenger: string;
  successor1: string;
  successor2: string;
  status: QuestStatus;
  createdAt?: string;
  completedAt?: string | null;
}

export interface CompletedQuestEntry {
  quest: Quest;
  completedAt: string;
}

export interface PartyMember {
  id: string;
  name: string;
  role: string;
  hp: number;
  mp: number;
  status: "ready" | "busy" | "resting";
  avatar: string;
  avatarType: string;
  level: number;
  exp: number;
  title: string;
  avatarFrame: "bronze" | "silver" | "gold" | "platinum";
}

export const EMPTY_SLOT = "—";

export const GUILD_STATS = {
  questsCleared: 127,
  guildRank: "Platinum IV",
  weeklyXp: 2840,
  morale: 87,
};
