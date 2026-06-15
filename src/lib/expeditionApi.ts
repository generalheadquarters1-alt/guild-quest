import {
  applyJobGoldBonus,
  calculateExpeditionSuccessRate,
  clampPercent,
  findExpeditionDestination,
  type Expedition,
  type ExpeditionDestination,
  type ExpeditionResult,
  type GrowthAction,
  type PlayerResources,
  type RewardItems,
  type RewardMaterialTable,
} from "../data/expeditions";
import { insertQuestLog } from "./questLogApi";
import { requireSupabase } from "./supabase";
import { awardPlayerExp } from "./staffApi";

export class ExpeditionError extends Error {
  code:
    | "tickets"
    | "already_in_progress"
    | "not_ready"
    | "claimed"
    | "fatigue"
    | "equipment"
    | "trust";

  constructor(code: ExpeditionError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

interface PlayerResourcesRow {
  id: number;
  player_name: string;
  expedition_tickets: number;
  gold: number;
  items: RewardItems | null;
  morale: number | null;
  fatigue: number | null;
  proficiency: number | null;
  trust: number | null;
  equipment_key: string | null;
  equipment_durability: number | null;
  job_class: string | null;
  last_trained_at: string | null;
  total_expedition_success: number | null;
  total_expedition_failure: number | null;
  created_at: string;
  updated_at: string;
}

interface ExpeditionRow {
  id: number;
  player_name: string;
  expedition_key: string;
  expedition_name: string;
  status: string;
  started_at: string;
  ends_at: string;
  claimed_at: string | null;
  reward_exp: number;
  reward_gold: number;
  reward_guild_exp: number;
  reward_items: RewardItems | null;
  reward_materials: RewardItems | null;
  result: string | null;
  success_rate: number | null;
  result_message: string | null;
  created_at: string;
}

export function rowToPlayerResources(row: PlayerResourcesRow): PlayerResources {
  return {
    playerName: row.player_name,
    expeditionTickets: row.expedition_tickets,
    gold: row.gold,
    items: row.items ?? {},
    morale: clampPercent(row.morale ?? 70),
    fatigue: clampPercent(row.fatigue ?? 0),
    proficiency: clampPercent(row.proficiency ?? 0),
    trust: clampPercent(row.trust ?? 0),
    equipmentKey: row.equipment_key || "wooden_sword",
    equipmentDurability: clampPercent(row.equipment_durability ?? 100),
    jobClass: row.job_class || "novice",
    lastTrainedAt: row.last_trained_at,
    totalExpeditionSuccess: Math.max(0, row.total_expedition_success ?? 0),
    totalExpeditionFailure: Math.max(0, row.total_expedition_failure ?? 0),
  };
}

export function rowToExpedition(row: ExpeditionRow): Expedition {
  const rewardMaterials = row.reward_materials ?? row.reward_items ?? {};
  return {
    id: row.id,
    playerName: row.player_name,
    expeditionKey: row.expedition_key,
    expeditionName: row.expedition_name,
    status:
      row.status === "completed" || row.status === "claimed"
        ? row.status
        : "in_progress",
    startedAt: row.started_at,
    endsAt: row.ends_at,
    claimedAt: row.claimed_at,
    rewardExp: row.reward_exp,
    rewardGold: row.reward_gold,
    rewardGuildExp: row.reward_guild_exp,
    rewardItems: row.reward_items ?? rewardMaterials,
    rewardMaterials,
    result:
      row.result === "success" || row.result === "failure"
        ? row.result
        : null,
    successRate: row.success_rate,
    resultMessage: row.result_message,
    createdAt: row.created_at,
  };
}

export async function ensurePlayerResources(
  playerName: string,
): Promise<PlayerResources> {
  const normalizedName = playerName.trim();
  if (!normalizedName) throw new Error("冒険者名が必要です。");

  const client = requireSupabase();
  const { data: existing, error: existingError } = await client
    .from("player_resources")
    .select("*")
    .eq("player_name", normalizedName)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return applyPassiveGrowthDecay(existing as PlayerResourcesRow);

  const now = new Date().toISOString();
  const { data: inserted, error: insertError } = await client
    .from("player_resources")
    .insert({
      player_name: normalizedName,
      morale: 70,
      fatigue: 0,
      proficiency: 0,
      trust: 0,
      equipment_key: "wooden_sword",
      equipment_durability: 100,
      job_class: "novice",
      last_trained_at: now,
    })
    .select("*")
    .single();

  if (insertError) {
    const { data: racedExisting, error: racedError } = await client
      .from("player_resources")
      .select("*")
      .eq("player_name", normalizedName)
      .maybeSingle();

    if (racedError) throw racedError;
    if (racedExisting) return applyPassiveGrowthDecay(racedExisting as PlayerResourcesRow);
    throw insertError;
  }

  return rowToPlayerResources(inserted as PlayerResourcesRow);
}

export async function fetchPlayerResources(
  playerName: string,
): Promise<PlayerResources> {
  return ensurePlayerResources(playerName);
}

export async function fetchPlayerExpeditions(
  playerName: string,
): Promise<Expedition[]> {
  if (!playerName.trim()) return [];

  const { data, error } = await requireSupabase()
    .from("expeditions")
    .select("*")
    .eq("player_name", playerName.trim())
    .order("created_at", { ascending: false })
    .limit(12);

  if (error) throw error;
  return (data as ExpeditionRow[]).map(rowToExpedition);
}

export async function awardExpeditionTickets(
  playerName: string,
  tickets: number,
): Promise<PlayerResources> {
  if (tickets <= 0) return ensurePlayerResources(playerName);

  const resources = await ensurePlayerResources(playerName);
  const { data, error } = await requireSupabase()
    .from("player_resources")
    .update({
      expedition_tickets: resources.expeditionTickets + tickets,
      updated_at: new Date().toISOString(),
    })
    .eq("player_name", playerName.trim())
    .select("*")
    .single();

  if (error) throw error;
  return rowToPlayerResources(data as PlayerResourcesRow);
}

export async function performGrowthAction(
  playerName: string,
  action: GrowthAction,
): Promise<PlayerResources> {
  const normalizedName = playerName.trim();
  const resources = await ensurePlayerResources(normalizedName);
  const now = new Date().toISOString();
  const patch = getGrowthActionPatch(action, resources);

  const { data, error } = await requireSupabase()
    .from("player_resources")
    .update({
      ...patch,
      last_trained_at: now,
      updated_at: now,
    })
    .eq("player_name", normalizedName)
    .select("*")
    .single();

  if (error) throw error;

  await insertQuestLog({
    questId: null,
    questTitle: growthActionQuestTitle(action),
    action,
    actorName: normalizedName,
  });

  return rowToPlayerResources(data as PlayerResourcesRow);
}

export async function startExpedition(
  playerName: string,
  destination: ExpeditionDestination,
  playerLevel = 1,
): Promise<Expedition> {
  const normalizedName = playerName.trim();
  const resources = await ensurePlayerResources(normalizedName);
  if (resources.expeditionTickets < destination.ticketCost) {
    throw new ExpeditionError("tickets", "遠征チケットが足りません。");
  }
  if (resources.fatigue >= 90) {
    throw new ExpeditionError("fatigue", "疲労が限界です。酒場で休息しましょう。");
  }
  if (resources.equipmentDurability <= 5) {
    throw new ExpeditionError(
      "equipment",
      "装備が壊れそうです。装備整備を行いましょう。",
    );
  }
  if (resources.trust < destination.requiredTrust) {
    throw new ExpeditionError(
      "trust",
      "この遠征には、まだギルドの信頼が足りません。",
    );
  }

  const { data: activeRows, error: activeError } = await requireSupabase()
    .from("expeditions")
    .select("*")
    .eq("player_name", normalizedName)
    .eq("status", "in_progress")
    .limit(1);

  if (activeError) throw activeError;
  if ((activeRows as ExpeditionRow[] | null)?.length) {
    throw new ExpeditionError("already_in_progress", "この冒険者はすでに遠征中です。");
  }

  const successRate = calculateExpeditionSuccessRate(
    destination,
    resources,
    playerLevel,
  ).total;
  const now = new Date();
  const endsAt = new Date(now.getTime() + destination.durationMinutes * 60 * 1000);

  const { error: resourceError } = await requireSupabase()
    .from("player_resources")
    .update({
      expedition_tickets: resources.expeditionTickets - destination.ticketCost,
      fatigue: clampPercent(resources.fatigue + destination.departureFatigue),
      equipment_durability: clampPercent(
        resources.equipmentDurability - destination.departureDurability,
      ),
      morale: clampPercent(resources.morale + destination.departureMorale),
      last_trained_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("player_name", normalizedName);

  if (resourceError) throw resourceError;

  const { data, error } = await requireSupabase()
    .from("expeditions")
    .insert({
      player_name: normalizedName,
      expedition_key: destination.key,
      expedition_name: destination.name,
      status: "in_progress",
      started_at: now.toISOString(),
      ends_at: endsAt.toISOString(),
      reward_exp: destination.rewardExp,
      reward_gold: destination.rewardGold,
      reward_guild_exp: destination.rewardGuildExp,
      reward_items: {},
      reward_materials: {},
      success_rate: successRate,
      result: null,
      result_message: null,
    })
    .select("*")
    .single();

  if (error) throw error;

  await insertQuestLog({
    questId: null,
    questTitle: destination.name,
    action: "expedition_started",
    actorName: normalizedName,
    details: `成功率 ${successRate}%`,
  });

  return rowToExpedition(data as ExpeditionRow);
}

export async function claimExpeditionReward(
  expedition: Expedition,
  playerName: string,
): Promise<{ expedition: Expedition; resources: PlayerResources }> {
  const normalizedName = playerName.trim();
  if (expedition.status === "claimed") {
    throw new ExpeditionError("claimed", "この遠征報酬は受取済みです。");
  }
  if (new Date(expedition.endsAt).getTime() > Date.now()) {
    throw new ExpeditionError("not_ready", "まだ帰還していません。");
  }

  const resources = await ensurePlayerResources(normalizedName);
  const destination =
    findExpeditionDestination(expedition.expeditionKey) ??
    fallbackDestination(expedition);
  const playerLevel = await fetchPlayerLevel(normalizedName);
  const successRate = calculateExpeditionSuccessRate(
    destination,
    resources,
    playerLevel,
  ).total;
  const succeeded = Math.floor(Math.random() * 100) + 1 <= successRate;
  const result: ExpeditionResult = succeeded ? "success" : "failure";
  const rewardMaterials = succeeded
    ? rollRewardMaterials(destination.rewardMaterials, destination.rareMaterial)
    : {};
  const rewardExp = succeeded ? destination.rewardExp : destination.failureRewardExp;
  const baseGold = succeeded
    ? destination.rewardGold
    : destination.failureRewardGold;
  const rewardGold = applyJobGoldBonus(baseGold, resources.jobClass);
  const rewardGuildExp = succeeded
    ? destination.rewardGuildExp
    : destination.failureRewardGuildExp;
  const resultMessage = succeeded
    ? `${destination.name}を探索した！宝箱を発見！`
    : `${destination.name}で危険に遭遇した。撤退した……`;
  const now = new Date().toISOString();
  const nextItems = mergeItems(resources.items, rewardMaterials);
  const nextResourcePatch = succeeded
    ? {
        gold: resources.gold + rewardGold,
        items: nextItems,
        trust: clampPercent(resources.trust + 3),
        morale: clampPercent(resources.morale + 5),
        proficiency: clampPercent(resources.proficiency + 5),
        total_expedition_success: resources.totalExpeditionSuccess + 1,
      }
    : {
        gold: resources.gold + rewardGold,
        items: nextItems,
        trust: clampPercent(resources.trust + 1),
        morale: clampPercent(resources.morale - 5),
        fatigue: clampPercent(resources.fatigue + 10),
        total_expedition_failure: resources.totalExpeditionFailure + 1,
      };

  await awardPlayerExp([{ name: normalizedName, exp: rewardExp }]);

  const { data: updatedResources, error: resourceError } = await requireSupabase()
    .from("player_resources")
    .update({
      ...nextResourcePatch,
      last_trained_at: now,
      updated_at: now,
    })
    .eq("player_name", normalizedName)
    .select("*")
    .single();

  if (resourceError) throw resourceError;

  const { data: updatedExpedition, error: expeditionError } = await requireSupabase()
    .from("expeditions")
    .update({
      status: "claimed",
      claimed_at: now,
      result,
      success_rate: successRate,
      result_message: resultMessage,
      reward_exp: rewardExp,
      reward_gold: rewardGold,
      reward_guild_exp: rewardGuildExp,
      reward_items: rewardMaterials,
      reward_materials: rewardMaterials,
    })
    .eq("id", expedition.id)
    .select("*")
    .single();

  if (expeditionError) throw expeditionError;

  const claimedExpedition = rowToExpedition(updatedExpedition as ExpeditionRow);
  await insertQuestLog({
    questId: null,
    questTitle: expedition.expeditionName,
    action: succeeded ? "expedition_success" : "expedition_failure",
    actorName: normalizedName,
    details: buildRewardDetails(claimedExpedition),
  });

  return {
    expedition: claimedExpedition,
    resources: rowToPlayerResources(updatedResources as PlayerResourcesRow),
  };
}

async function applyPassiveGrowthDecay(
  row: PlayerResourcesRow,
): Promise<PlayerResources> {
  const resources = rowToPlayerResources(row);
  const now = Date.now();
  const last = resources.lastTrainedAt
    ? new Date(resources.lastTrainedAt).getTime()
    : Number.NaN;

  if (!Number.isFinite(last)) {
    const { data, error } = await requireSupabase()
      .from("player_resources")
      .update({
        last_trained_at: new Date(now).toISOString(),
        updated_at: new Date(now).toISOString(),
      })
      .eq("player_name", resources.playerName)
      .select("*")
      .single();
    if (error) throw error;
    return rowToPlayerResources(data as PlayerResourcesRow);
  }

  const elapsedHours = Math.min(
    24,
    Math.floor(Math.max(0, now - last) / (60 * 60 * 1000)),
  );
  if (elapsedHours < 1) return resources;

  const { data, error } = await requireSupabase()
    .from("player_resources")
    .update({
      morale: clampPercent(resources.morale - elapsedHours * 2),
      fatigue: clampPercent(resources.fatigue + elapsedHours * 2),
      equipment_durability: clampPercent(
        resources.equipmentDurability - elapsedHours,
      ),
      last_trained_at: new Date(now).toISOString(),
      updated_at: new Date(now).toISOString(),
    })
    .eq("player_name", resources.playerName)
    .select("*")
    .single();

  if (error) throw error;
  return rowToPlayerResources(data as PlayerResourcesRow);
}

function getGrowthActionPatch(
  action: GrowthAction,
  resources: PlayerResources,
): Partial<PlayerResourcesRow> {
  switch (action) {
    case "train_proficiency":
      return {
        proficiency: clampPercent(resources.proficiency + 10),
        fatigue: clampPercent(resources.fatigue + 15),
        morale: clampPercent(resources.morale - 5),
      };
    case "rest_tavern":
      return {
        fatigue: clampPercent(resources.fatigue - 30),
        morale: clampPercent(resources.morale + 10),
      };
    case "guild_meeting":
      return {
        trust: clampPercent(resources.trust + 10),
        morale: clampPercent(resources.morale + 10),
      };
    case "maintain_equipment":
      return {
        equipment_durability: clampPercent(resources.equipmentDurability + 30),
        fatigue: clampPercent(resources.fatigue + 5),
      };
  }
}

function growthActionQuestTitle(action: GrowthAction) {
  switch (action) {
    case "train_proficiency":
      return "訓練";
    case "rest_tavern":
      return "酒場で休息";
    case "guild_meeting":
      return "ギルド集会";
    case "maintain_equipment":
      return "装備整備";
  }
}

async function fetchPlayerLevel(playerName: string) {
  const { data, error } = await requireSupabase()
    .from("staff")
    .select("level")
    .eq("name", playerName)
    .maybeSingle();
  if (error) return 1;
  const level = Number((data as { level?: number } | null)?.level ?? 1);
  return Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1;
}

function rollRewardMaterials(
  table?: RewardMaterialTable,
  rareMaterial?: ExpeditionDestination["rareMaterial"],
): RewardItems {
  const rewards: RewardItems = {};
  for (const [name, range] of Object.entries(table ?? {})) {
    const amount =
      typeof range === "number"
        ? range
        : randomInt(range.min, range.max);
    if (amount > 0) rewards[name] = (rewards[name] ?? 0) + amount;
  }
  if (rareMaterial && Math.random() < rareMaterial.chance) {
    rewards[rareMaterial.name] =
      (rewards[rareMaterial.name] ?? 0) + (rareMaterial.amount ?? 1);
  }
  return rewards;
}

function randomInt(min: number, max: number) {
  const lower = Math.ceil(Math.min(min, max));
  const upper = Math.floor(Math.max(min, max));
  return Math.floor(Math.random() * (upper - lower + 1)) + lower;
}

function mergeItems(current: RewardItems, gained: RewardItems): RewardItems {
  const next = { ...current };
  for (const [name, amount] of Object.entries(gained)) {
    if (amount <= 0) continue;
    next[name] = (next[name] ?? 0) + amount;
  }
  return next;
}

function buildRewardDetails(expedition: Expedition) {
  const itemText = Object.entries(expedition.rewardMaterials)
    .filter(([, amount]) => amount > 0)
    .map(([name, amount]) => `${name} +${amount}`)
    .join(" / ");
  return [
    expedition.result === "success" ? "遠征成功" : "遠征失敗",
    `成功率 ${expedition.successRate ?? "-"}%`,
    `EXP +${expedition.rewardExp}`,
    `GOLD +${expedition.rewardGold}`,
    expedition.rewardGuildExp > 0 ? `ギルドEXP +${expedition.rewardGuildExp}` : "",
    itemText,
  ]
    .filter(Boolean)
    .join(" / ");
}

function fallbackDestination(expedition: Expedition): ExpeditionDestination {
  return {
    key: expedition.expeditionKey,
    name: expedition.expeditionName,
    icon: "🧭",
    durationMinutes: 0,
    ticketCost: 0,
    baseSuccessRate: expedition.successRate ?? 70,
    requiredTrust: 0,
    rewardExp: expedition.rewardExp,
    rewardGold: expedition.rewardGold,
    rewardGuildExp: expedition.rewardGuildExp,
    failureRewardExp: Math.max(1, Math.floor(expedition.rewardExp * 0.2)),
    failureRewardGold: Math.max(0, Math.floor(expedition.rewardGold * 0.2)),
    failureRewardGuildExp: 0,
    departureFatigue: 0,
    departureDurability: 0,
    departureMorale: 0,
    description: "記録済みの遠征です。",
  };
}
