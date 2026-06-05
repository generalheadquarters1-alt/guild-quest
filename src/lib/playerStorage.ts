export const GUILD_PLAYER_STORAGE_KEY = "guild_quest_player_name";
const LEGACY_STORAGE_KEY = "todo-quest-player";

export function loadSelectedPlayer(fallbackName: string): string {
  try {
    const guildName = localStorage.getItem(GUILD_PLAYER_STORAGE_KEY);
    if (guildName) return guildName;
    const legacyName = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyName) return legacyName;
    return fallbackName;
  } catch {
    return fallbackName;
  }
}

export function saveSelectedPlayer(name: string): void {
  try {
    localStorage.setItem(GUILD_PLAYER_STORAGE_KEY, name);
    localStorage.setItem(LEGACY_STORAGE_KEY, name);
  } catch {
    /* ignore */
  }
}

export function clearSelectedPlayer(): void {
  try {
    localStorage.removeItem(GUILD_PLAYER_STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function resolveSelectedPlayer(
  storedName: string,
  staffNames: string[],
  fallbackName: string,
): string {
  if (staffNames.length === 0) return fallbackName;
  if (staffNames.includes(storedName)) return storedName;
  return staffNames[0] ?? fallbackName;
}
