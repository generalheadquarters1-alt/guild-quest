import type { PartyMember } from "../data/quests";
import { normalizeAvatarType } from "../data/avatars";

export interface StaffRow {
  id: number;
  name: string;
  role: string;
  avatar: string;
  hp: number;
  mp: number;
  status: string;
  avatar_type?: string | null;
  level?: number | null;
  exp?: number | null;
  title?: string | null;
  avatar_frame?: string | null;
  is_active?: boolean | null;
  sort_order: number;
  created_at: string;
}

const STATUSES: PartyMember["status"][] = ["ready", "busy", "resting"];
const FRAMES: PartyMember["avatarFrame"][] = [
  "bronze",
  "silver",
  "gold",
  "platinum",
];

function parseStatus(value: string): PartyMember["status"] {
  if (STATUSES.includes(value as PartyMember["status"])) {
    return value as PartyMember["status"];
  }
  return "ready";
}

function parseFrame(value: string | null | undefined): PartyMember["avatarFrame"] {
  if (FRAMES.includes(value as PartyMember["avatarFrame"])) {
    return value as PartyMember["avatarFrame"];
  }
  return "bronze";
}

export function rowToStaffMember(row: StaffRow): PartyMember {
  return {
    id: String(row.id),
    name: row.name,
    role: row.role,
    avatar: row.avatar,
    hp: row.hp,
    mp: row.mp,
    status: parseStatus(row.status),
    avatarType: normalizeAvatarType(row.avatar_type),
    level: row.level ?? Math.floor((row.exp ?? 0) / 100) + 1,
    exp: row.exp ?? 0,
    title: row.title ?? "見習い冒険者",
    avatarFrame: parseFrame(row.avatar_frame),
    isActive: row.is_active ?? true,
  };
}
