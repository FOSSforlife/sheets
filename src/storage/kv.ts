/** Thin, typed wrapper around localStorage. All app keys share one prefix. */

export const PREFIX = "sheets:v1:";
/** Browsers typically allow ~5 MB (UTF-16 → ~5M chars) per origin. */
export const QUOTA_CHARS = 5 * 1024 * 1024;

export class StorageWriteError extends Error {
  constructor(
    readonly key: string,
    readonly cause: unknown,
  ) {
    super(
      isQuotaError(cause)
        ? "Browser storage is full. Delete or export some tables to free space."
        : `Could not save to browser storage: ${String(cause)}`,
    );
  }
}

function isQuotaError(e: unknown): boolean {
  return e instanceof DOMException && (e.name === "QuotaExceededError" || e.code === 22);
}

export function readJson<T>(key: string): T | null {
  const raw = localStorage.getItem(PREFIX + key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    console.error(`Corrupt storage entry ${key}`);
    return null;
  }
}

let persistenceDisabled = false;

/** Stops all writes (used right before a reload after reset/restore, so nothing re-saves stale state). */
export function disablePersistence(): void {
  persistenceDisabled = true;
}

export function writeJson(key: string, value: unknown): void {
  if (persistenceDisabled) return;
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (e) {
    throw new StorageWriteError(key, e);
  }
}

export function removeKey(key: string): void {
  localStorage.removeItem(PREFIX + key);
}

export function appKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(PREFIX)) keys.push(k.slice(PREFIX.length));
  }
  return keys;
}

/** Approximate number of characters this app uses in localStorage. */
export function usedChars(): number {
  let total = 0;
  for (const k of appKeys())
    total += k.length + PREFIX.length + (localStorage.getItem(PREFIX + k)?.length ?? 0);
  return total;
}

export function usageFraction(): number {
  return usedChars() / QUOTA_CHARS;
}

/** Subscribes to writes from other windows. `key` is the un-prefixed app key (null = cleared). */
export function onExternalChange(cb: (key: string | null) => void): () => void {
  const handler = (e: StorageEvent) => {
    if (e.storageArea !== localStorage) return;
    if (e.key === null) cb(null);
    else if (e.key.startsWith(PREFIX)) cb(e.key.slice(PREFIX.length));
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}
