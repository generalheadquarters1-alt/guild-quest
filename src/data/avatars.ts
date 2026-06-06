import femaleHero from "../assets/avatars/female-hero.png";
import maleHero from "../assets/avatars/male-hero.png";

export type AvatarType = string;

export interface AvatarDefinition {
  type: AvatarType;
  label: string;
  src: string;
  fallbackIcon: string;
}

export const DEFAULT_AVATAR_TYPE = "male";

export const AVATAR_OPTIONS: AvatarDefinition[] = [
  {
    type: "male",
    label: "男勇者",
    src: maleHero,
    fallbackIcon: "⚔️",
  },
  {
    type: "female",
    label: "女勇者",
    src: femaleHero,
    fallbackIcon: "⚔️",
  },
];

export function getAvatarDefinition(
  avatarType: AvatarType | null | undefined,
): AvatarDefinition {
  return (
    AVATAR_OPTIONS.find((avatar) => avatar.type === avatarType) ??
    AVATAR_OPTIONS[0]
  );
}

export function normalizeAvatarType(
  avatarType: AvatarType | null | undefined,
): AvatarType {
  if (typeof avatarType === "string" && avatarType.trim()) {
    return avatarType.trim();
  }
  return DEFAULT_AVATAR_TYPE;
}
