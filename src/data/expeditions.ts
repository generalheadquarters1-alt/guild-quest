export type ExpeditionStatus = "in_progress" | "completed" | "claimed";
export type ExpeditionResult = "success" | "failure";
export type GrowthAction =
  | "train_proficiency"
  | "rest_tavern"
  | "guild_meeting"
  | "maintain_equipment";

export type RewardItems = Record<string, number>;
export type RewardRange = number | { min: number; max: number };
export type RewardMaterialTable = Record<string, RewardRange>;

export interface ExpeditionDestination {
  key: string;
  name: string;
  icon: string;
  durationMinutes: number;
  ticketCost: number;
  baseSuccessRate: number;
  requiredTrust: number;
  rewardExp: number;
  rewardGold: number;
  rewardGuildExp: number;
  failureRewardExp: number;
  failureRewardGold: number;
  failureRewardGuildExp: number;
  rewardMaterials?: RewardMaterialTable;
  rareMaterial?: {
    name: string;
    chance: number;
    amount?: number;
  };
  departureFatigue: number;
  departureDurability: number;
  departureMorale: number;
  description: string;
  rewardItems?: RewardItems;
  rareItem?: {
    name: string;
    chance: number;
  };
}

export interface PlayerResources {
  playerName: string;
  expeditionTickets: number;
  gold: number;
  items: RewardItems;
  morale: number;
  fatigue: number;
  proficiency: number;
  trust: number;
  equipmentKey: string;
  equipmentDurability: number;
  jobClass: string;
  lastTrainedAt: string | null;
  totalExpeditionSuccess: number;
  totalExpeditionFailure: number;
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
  rewardMaterials: RewardItems;
  result: ExpeditionResult | null;
  successRate: number | null;
  resultMessage: string | null;
  createdAt: string;
}

export interface EquipmentDefinition {
  key: string;
  label: string;
  successBonus: number;
}

export interface JobClassDefinition {
  key: string;
  label: string;
  successBonus: number;
  expeditionBonuses?: Partial<Record<string, number>>;
  goldMultiplier?: number;
  fatiguePenaltyReduction?: number;
}

export interface SuccessRateBreakdown {
  base: number;
  levelBonus: number;
  moraleBonus: number;
  proficiencyBonus: number;
  equipmentBonus: number;
  jobBonus: number;
  fatiguePenalty: number;
  durabilityPenalty: number;
  total: number;
}

export const EQUIPMENT: Record<string, EquipmentDefinition> = {
  wooden_sword: {
    key: "wooden_sword",
    label: "木の剣",
    successBonus: 0,
  },
  iron_sword: {
    key: "iron_sword",
    label: "鉄の剣",
    successBonus: 5,
  },
  mithril_gear: {
    key: "mithril_gear",
    label: "ミスリル装備",
    successBonus: 10,
  },
  legendary_cart: {
    key: "legendary_cart",
    label: "伝説の補充カート",
    successBonus: 15,
  },
};

export const JOB_CLASSES: Record<string, JobClassDefinition> = {
  novice: {
    key: "novice",
    label: "見習い冒険者",
    successBonus: 0,
  },
  warrior: {
    key: "warrior",
    label: "戦士",
    successBonus: 0,
    expeditionBonuses: { monster_den: 8 },
  },
  knight: {
    key: "knight",
    label: "騎士",
    successBonus: 2,
    fatiguePenaltyReduction: 4,
  },
  merchant: {
    key: "merchant",
    label: "商人",
    successBonus: 0,
    goldMultiplier: 1.1,
  },
  ranger: {
    key: "ranger",
    label: "探索者",
    successBonus: 0,
    expeditionBonuses: { forest: 8 },
  },
  scholar: {
    key: "scholar",
    label: "学者",
    successBonus: 0,
    expeditionBonuses: { ruins: 8 },
  },
  sage: {
    key: "sage",
    label: "賢者",
    successBonus: 4,
    expeditionBonuses: { ruins: 4 },
  },
  hero: {
    key: "hero",
    label: "英雄",
    successBonus: 10,
  },
};

export const GROWTH_ACTION_LABELS: Record<GrowthAction, string> = {
  train_proficiency: "訓練する",
  rest_tavern: "酒場で休息",
  guild_meeting: "ギルド集会",
  maintain_equipment: "装備整備",
};

export const EXPEDITION_DESTINATIONS: ExpeditionDestination[] = [
  {
    key: "forest",
    name: "近場の森",
    icon: "🌲",
    durationMinutes: 10,
    ticketCost: 1,
    baseSuccessRate: 90,
    requiredTrust: 0,
    rewardExp: 20,
    rewardGold: 10,
    rewardGuildExp: 5,
    failureRewardExp: 5,
    failureRewardGold: 2,
    failureRewardGuildExp: 0,
    rewardMaterials: { 木材: { min: 1, max: 2 } },
    departureFatigue: 5,
    departureDurability: 3,
    departureMorale: 0,
    description: "短時間で戻れる安全な遠征。新人冒険者にも向いている。",
  },
  {
    key: "mine",
    name: "古びた鉱山",
    icon: "⛏️",
    durationMinutes: 30,
    ticketCost: 2,
    baseSuccessRate: 70,
    requiredTrust: 10,
    rewardExp: 60,
    rewardGold: 35,
    rewardGuildExp: 15,
    failureRewardExp: 15,
    failureRewardGold: 5,
    failureRewardGuildExp: 0,
    rewardMaterials: { 鉄鉱石: { min: 1, max: 3 } },
    departureFatigue: 12,
    departureDurability: 8,
    departureMorale: -1,
    description: "鉱石が眠る坑道。装備強化の素材が手に入る。",
  },
  {
    key: "monster_den",
    name: "魔物の巣",
    icon: "🐉",
    durationMinutes: 60,
    ticketCost: 3,
    baseSuccessRate: 50,
    requiredTrust: 25,
    rewardExp: 150,
    rewardGold: 80,
    rewardGuildExp: 30,
    failureRewardExp: 30,
    failureRewardGold: 10,
    failureRewardGuildExp: 0,
    rewardMaterials: { 魔石: 1 },
    departureFatigue: 20,
    departureDurability: 12,
    departureMorale: -2,
    description: "危険だが報酬は大きい。鍛えた冒険者向け。",
  },
  {
    key: "ruins",
    name: "古代遺跡",
    icon: "🏛️",
    durationMinutes: 120,
    ticketCost: 4,
    baseSuccessRate: 35,
    requiredTrust: 50,
    rewardExp: 300,
    rewardGold: 160,
    rewardGuildExp: 60,
    failureRewardExp: 50,
    failureRewardGold: 20,
    failureRewardGuildExp: 0,
    rewardMaterials: { 古代の欠片: 1 },
    rareMaterial: { name: "古代レリック", chance: 0.15, amount: 1 },
    departureFatigue: 30,
    departureDurability: 18,
    departureMorale: -3,
    description: "失われた文明の跡地。成功すれば大きな成果が得られる。",
  },
];

export function findExpeditionDestination(key: string) {
  return EXPEDITION_DESTINATIONS.find((destination) => destination.key === key);
}

export function getEquipment(key: string | null | undefined) {
  return EQUIPMENT[key ?? ""] ?? EQUIPMENT.wooden_sword;
}

export function getJobClass(key: string | null | undefined) {
  return JOB_CLASSES[key ?? ""] ?? JOB_CLASSES.novice;
}

export function calculateExpeditionSuccessRate(
  destination: ExpeditionDestination,
  resources: Pick<
    PlayerResources,
    | "morale"
    | "fatigue"
    | "proficiency"
    | "equipmentKey"
    | "equipmentDurability"
    | "jobClass"
  >,
  level: number,
): SuccessRateBreakdown {
  const equipment = getEquipment(resources.equipmentKey);
  const job = getJobClass(resources.jobClass);
  const levelBonus = Math.min(Math.max(1, Math.floor(level)) * 1, 20);
  const moraleBonus = Math.floor((clampPercent(resources.morale) - 50) / 5);
  const proficiencyBonus = Math.floor(clampPercent(resources.proficiency) / 10);
  const equipmentBonus = equipment.successBonus;
  const jobBonus =
    job.successBonus + (job.expeditionBonuses?.[destination.key] ?? 0);
  const rawFatiguePenalty = Math.floor(clampPercent(resources.fatigue) / 5);
  const fatiguePenalty = Math.max(
    0,
    rawFatiguePenalty - (job.fatiguePenaltyReduction ?? 0),
  );
  const durabilityPenalty = clampPercent(resources.equipmentDurability) < 30 ? 10 : 0;
  const total = clampRate(
    destination.baseSuccessRate +
      levelBonus +
      moraleBonus +
      proficiencyBonus +
      equipmentBonus +
      jobBonus -
      fatiguePenalty -
      durabilityPenalty,
  );

  return {
    base: destination.baseSuccessRate,
    levelBonus,
    moraleBonus,
    proficiencyBonus,
    equipmentBonus,
    jobBonus,
    fatiguePenalty,
    durabilityPenalty,
    total,
  };
}

export function applyJobGoldBonus(gold: number, jobClass: string) {
  return Math.floor(gold * (getJobClass(jobClass).goldMultiplier ?? 1));
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

export function formatRewardMaterialTable(materials?: RewardMaterialTable) {
  return Object.entries(materials ?? {}).map(([name, range]) => {
    if (typeof range === "number") return `${name} +${range}`;
    return `${name} +${range.min}〜${range.max}`;
  });
}

export function clampPercent(value: number | null | undefined) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(Number(value))));
}

function clampRate(value: number) {
  return Math.min(98, Math.max(10, Math.round(value)));
}
