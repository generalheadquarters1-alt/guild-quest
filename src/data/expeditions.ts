export type ExpeditionStatus = "in_progress" | "completed" | "claimed";

export type RewardItems = Record<string, number>;

export interface ExpeditionDestination {
  key: string;
  name: string;
  icon: string;
  durationMinutes: number;
  ticketCost: number;
  rewardExp: number;
  rewardGold: number;
  rewardGuildExp: number;
  rewardItems?: RewardItems;
  rareItem?: {
    name: string;
    chance: number;
  };
  description: string;
}

export interface PlayerResources {
  playerName: string;
  expeditionTickets: number;
  gold: number;
  items: RewardItems;
}

export interface Expedition {
  id: number;
  playerName: string;
  expeditionKey: string;
  expeditionName: string;
  status: ExpeditionStatus;
  startedAt: string;
  endsAt: string;
  claimedAt: string | null;
  rewardExp: number;
  rewardGold: number;
  rewardGuildExp: number;
  rewardItems: RewardItems;
  createdAt: string;
}

export const EXPEDITION_DESTINATIONS: ExpeditionDestination[] = [
  {
    key: "forest",
    name: "近場の森",
    icon: "🌲",
    durationMinutes: 10,
    ticketCost: 1,
    rewardExp: 20,
    rewardGold: 10,
    rewardGuildExp: 5,
    description: "短時間で戻れる安全な遠征。まずはここから。",
  },
  {
    key: "mine",
    name: "古びた鉱山",
    icon: "⛏️",
    durationMinutes: 30,
    ticketCost: 2,
    rewardExp: 60,
    rewardGold: 35,
    rewardGuildExp: 15,
    rareItem: { name: "鉄鉱石", chance: 0.28 },
    description: "鉱石が眠る坑道。装備強化の素材が手に入ることもある。",
  },
  {
    key: "monster_den",
    name: "魔物の巣",
    icon: "🐉",
    durationMinutes: 60,
    ticketCost: 3,
    rewardExp: 150,
    rewardGold: 80,
    rewardGuildExp: 30,
    rareItem: { name: "魔石", chance: 0.22 },
    description: "危険だが報酬は大きい。腕に覚えのある冒険者向け。",
  },
];

export function findExpeditionDestination(key: string) {
  return EXPEDITION_DESTINATIONS.find((destination) => destination.key === key);
}

export function getExpeditionTicketsForRank(rank: number): number {
  if (rank >= 25) return 3;
  if (rank >= 15) return 2;
  return 1;
}

export function isExpeditionReady(expedition: Expedition, now = Date.now()) {
  return expedition.status !== "claimed" && new Date(expedition.endsAt).getTime() <= now;
}

export function getCurrentExpedition(expeditions: Expedition[]) {
  return expeditions.find((expedition) => expedition.status !== "claimed") ?? null;
}

export function formatRemainingTime(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}時間${minutes}分`;
  if (minutes > 0) return `${minutes}分${seconds.toString().padStart(2, "0")}秒`;
  return `${seconds}秒`;
}

export function formatRewardItems(items: RewardItems) {
  return Object.entries(items)
    .filter(([, amount]) => amount > 0)
    .map(([name, amount]) => `${name} +${amount}`);
}
