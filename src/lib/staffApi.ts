import { rowToStaffMember, type StaffRow } from "./staffMapper";
import type { PartyMember } from "../data/quests";
import { DEFAULT_AVATAR_TYPE, normalizeAvatarType } from "../data/avatars";
import { requireSupabase } from "./supabase";

export async function fetchStaff(): Promise<PartyMember[]> {
  const { data, error } = await requireSupabase()
    .from("staff")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data as StaffRow[]).map(rowToStaffMember);
}

const ENTRY_AVATARS = ["🧙", "⚔️", "🛡️", "📜", "✨", "🎵", "🏹", "🔮"];

export async function ensureStaffMember(
  name: string,
  avatarType: string = DEFAULT_AVATAR_TYPE,
): Promise<PartyMember> {
  const normalizedName = name.trim();
  const normalizedAvatarType = normalizeAvatarType(avatarType);
  if (!normalizedName) {
    throw new Error("冒険者名を入力してください");
  }

  const client = requireSupabase();
  const { data: existing, error: existingError } = await client
    .from("staff")
    .select("*")
    .eq("name", normalizedName)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) {
    const existingRow = existing as StaffRow;
    if (!existingRow.avatar_type) {
      const { data: updated, error: updateError } = await client
        .from("staff")
        .update({ avatar_type: normalizedAvatarType })
        .eq("id", existingRow.id)
        .select("*")
        .single();

      if (updateError) throw updateError;
      return rowToStaffMember(updated as StaffRow);
    }

    return rowToStaffMember(existingRow);
  }

  const { data: lastRows, error: sortError } = await client
    .from("staff")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1);

  if (sortError) throw sortError;

  const lastSort = ((lastRows?.[0] as { sort_order?: number } | undefined)
    ?.sort_order ?? 0);
  const insertPayload = {
    name: normalizedName,
    role: "冒険者",
    avatar: resolveEntryAvatar(normalizedName),
    avatar_type: normalizedAvatarType,
    hp: 100,
    mp: 50,
    status: "ready",
    level: 1,
    exp: 0,
    title: "見習い冒険者",
    avatar_frame: "bronze",
    sort_order: lastSort + 1,
  };

  const { data: inserted, error: insertError } = await client
    .from("staff")
    .insert(insertPayload)
    .select("*")
    .single();

  if (insertError) {
    const { data: racedExisting, error: racedError } = await client
      .from("staff")
      .select("*")
      .eq("name", normalizedName)
      .maybeSingle();

    if (racedError) throw racedError;
    if (racedExisting) return rowToStaffMember(racedExisting as StaffRow);
    throw insertError;
  }

  return rowToStaffMember(inserted as StaffRow);
}

export async function awardPlayerExp(
  awards: Array<{ name: string; exp: number }>,
): Promise<void> {
  const validAwards = awards.filter((award) => award.name && award.exp > 0);
  if (validAwards.length === 0) return;

  const names = [...new Set(validAwards.map((award) => award.name))];
  const { data, error } = await requireSupabase()
    .from("staff")
    .select("*")
    .in("name", names);

  if (error) throw error;

  const rows = data as StaffRow[];
  const updates = await Promise.all(
    rows.map((row) => {
      const gained = validAwards
        .filter((award) => award.name === row.name)
        .reduce((sum, award) => sum + award.exp, 0);
      const nextExp = (row.exp ?? 0) + gained;
      const nextLevel = Math.floor(nextExp / 100) + 1;
      return requireSupabase()
        .from("staff")
        .update({
          exp: nextExp,
          level: nextLevel,
          title: row.title ?? "見習い冒険者",
          avatar_frame: resolveFrame(nextLevel),
        })
        .eq("id", row.id);
    }),
  );

  const failed = updates.find((result) => result.error);
  if (failed?.error) throw failed.error;
}

function resolveEntryAvatar(name: string): string {
  const seed = Array.from(name).reduce(
    (sum, char) => sum + char.charCodeAt(0),
    0,
  );
  return ENTRY_AVATARS[seed % ENTRY_AVATARS.length];
}

function resolveFrame(level: number): string {
  if (level >= 15) return "platinum";
  if (level >= 10) return "gold";
  if (level >= 5) return "silver";
  return "bronze";
}
