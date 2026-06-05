const STORAGE_KEY = "todo-quest-player";

export function loadSelectedPlayer(fallbackName: string): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallbackName;
    return raw;
  } catch {
    return fallbackName;
  }
}

export function saveSelectedPlayer(name: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, name);
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
