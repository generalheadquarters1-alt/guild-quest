import { rowToStaffMember, type StaffRow } from "./staffMapper";
import type { PartyMember } from "../data/quests";
import { requireSupabase } from "./supabase";

export async function fetchStaff(): Promise<PartyMember[]> {
  const { data, error } = await requireSupabase()
    .from("staff")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data as StaffRow[]).map(rowToStaffMember);
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

function resolveFrame(level: number): string {
  if (level >= 15) return "platinum";
  if (level >= 10) return "gold";
  if (level >= 5) return "silver";
  return "bronze";
}
