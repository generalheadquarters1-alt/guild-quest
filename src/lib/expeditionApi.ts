import {
  type Expedition,
  type ExpeditionDestination,
  type PlayerResources,
  type RewardItems,
} from "../data/expeditions";
import { insertQuestLog } from "./questLogApi";
import { requireSupabase } from "./supabase";
import { awardPlayerExp } from "./staffApi";

export class ExpeditionError extends Error {
  code: "tickets" | "already_in_progress" | "not_ready" | "claimed";

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
  created_at: string;
}

export function rowToPlayerResources(row: PlayerResourcesRow): PlayerResources {
  return {
    playerName: row.player_name,
    expeditionTickets: row.expedition_tickets,
    gold: row.gold,
    items: row.items ?? {},
  };
}

export function rowToExpedition(row: ExpeditionRow): Expedition {
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
    rewardItems: row.reward_items ?? {},
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
  if (existing) return rowToPlayerResources(existing as PlayerResourcesRow);

  const { data: inserted, error: insertError } = await client
    .from("player_resources")
    .insert({ player_name: normalizedName })
    .select("*")
    .single();

  if (insertError) {
    const { data: racedExisting, error: racedError } = await client
      .from("player_resources")
      .select("*")
      .eq("player_name", normalizedName)
      .maybeSingle();

    if (racedError) throw racedError;
    if (racedExisting) return rowToPlayerResources(racedExisting as PlayerResourcesRow);
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

export async function startExpedition(
  playerName: string,
  destination: ExpeditionDestination,
): Promise<Expedition> {
  const normalizedName = playerName.trim();
  const resources = await ensurePlayerResources(normalizedName);
  if (resources.expeditionTickets < destination.ticketCost) {
    throw new ExpeditionError("tickets", "遠征チケットが足りません。");
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

  const rewardItems = rollRewardItems(destination);
  const now = new Date();
  const endsAt = new Date(now.getTime() + destination.durationMinutes * 60 * 1000);

  const { error: ticketError } = await requireSupabase()
    .from("player_resources")
    .update({
      expedition_tickets: resources.expeditionTickets - destination.ticketCost,
      updated_at: now.toISOString(),
    })
    .eq("player_name", normalizedName);

  if (ticketError) throw ticketError;

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
      reward_items: rewardItems,
    })
    .select("*")
    .single();

  if (error) throw error;

  await insertQuestLog({
    questId: null,
    questTitle: destination.name,
    action: "expedition_started",
    actorName: normalizedName,
    details: destination.name,
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
  const nextItems = mergeItems(resources.items, expedition.rewardItems);
  const now = new Date().toISOString();

  await awardPlayerExp([{ name: normalizedName, exp: expedition.rewardExp }]);

  const { data: updatedResources, error: resourceError } = await requireSupabase()
    .from("player_resources")
    .update({
      gold: resources.gold + expedition.rewardGold,
      items: nextItems,
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
    })
    .eq("id", expedition.id)
    .select("*")
    .single();

  if (expeditionError) throw expeditionError;

  await insertQuestLog({
    questId: null,
    questTitle: expedition.expeditionName,
    action: "expedition_claimed",
    actorName: normalizedName,
    details: buildRewardDetails(expedition),
  });

  return {
    expedition: rowToExpedition(updatedExpedition as ExpeditionRow),
    resources: rowToPlayerResources(updatedResources as PlayerResourcesRow),
  };
}

function rollRewardItems(destination: ExpeditionDestination): RewardItems {
  const base = { ...(destination.rewardItems ?? {}) };
  if (destination.rareItem && Math.random() < destination.rareItem.chance) {
    base[destination.rareItem.name] = (base[destination.rareItem.name] ?? 0) + 1;
  }
  return base;
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
  const itemText = Object.entries(expedition.rewardItems)
    .filter(([, amount]) => amount > 0)
    .map(([name, amount]) => `${name} +${amount}`)
    .join(" / ");
  return [
    `EXP +${expedition.rewardExp}`,
    `GOLD +${expedition.rewardGold}`,
    `ギルドEXP +${expedition.rewardGuildExp}`,
    itemText,
  ]
    .filter(Boolean)
    .join(" / ");
}
