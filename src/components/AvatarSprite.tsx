import { getAvatarDefinition } from "../data/avatars";

type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl" | "portrait";

interface AvatarSpriteProps {
  avatarType?: string | null;
  fallback?: string;
  alt?: string;
  frame?: string;
  size?: AvatarSize;
  selected?: boolean;
  useFallbackWhenMissing?: boolean;
  className?: string;
}

export function AvatarSprite({
  avatarType,
  fallback,
  alt,
  frame,
  size = "md",
  selected = false,
  useFallbackWhenMissing = false,
  className = "",
}: AvatarSpriteProps) {
  const useFallback = useFallbackWhenMissing && !avatarType;
  const avatar = useFallback ? null : getAvatarDefinition(avatarType);

  return (
    <span
      className={`avatar-sprite avatar-sprite-${size} ${
        frame ? `avatar-frame-${frame}` : ""
      } ${selected ? "is-selected" : ""} ${className}`}
    >
      {avatar ? (
        <img src={avatar.src} alt={alt ?? avatar.label} />
      ) : (
        <span aria-hidden>{fallback ?? "⚔️"}</span>
      )}
    </span>
  );
}
