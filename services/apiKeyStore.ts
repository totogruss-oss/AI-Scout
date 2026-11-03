/**
 * Verwaltung des Gemini-API-Keys nach dem Prinzip "Bring Your Own Key".
 *
 * Der Key wird NIE in den Build eingebaut und nie an einen eigenen Server geschickt.
 * Er liegt ausschließlich im Browser der nutzenden Person:
 *  - Standard: sessionStorage  -> beim Schließen des Tabs automatisch gelöscht
 *  - Optional: localStorage    -> bleibt auf diesem Gerät, bis er manuell gelöscht wird
 */

const STORAGE_KEY = 'ai_scout_gemini_key';
export const KEY_CHANGED_EVENT = 'ai-scout:key-changed';
export const KEY_REQUIRED_EVENT = 'ai-scout:key-required';

export type KeyPersistence = 'session' | 'device';

export class MissingApiKeyError extends Error {
  constructor() {
    super('Kein Gemini-API-Key hinterlegt.');
    this.name = 'MissingApiKeyError';
  }
}

const safeGet = (storage: Storage): string | null => {
  try {
    return storage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

const safeRemove = (storage: Storage) => {
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    /* Speicher nicht verfügbar (z. B. privater Modus) */
  }
};

// Fallback, falls der Browser keinen Speicher erlaubt: Key nur im Arbeitsspeicher
let memoryKey: string | null = null;

export const getApiKey = (): string | null =>
  safeGet(sessionStorage) || safeGet(localStorage) || memoryKey;

export const getKeyPersistence = (): KeyPersistence | null => {
  if (safeGet(localStorage)) return 'device';
  if (safeGet(sessionStorage) || memoryKey) return 'session';
  return null;
};

export const setApiKey = (key: string, persistence: KeyPersistence) => {
  const trimmed = key.trim();
  clearApiKey(false);
  memoryKey = trimmed;
  try {
    (persistence === 'device' ? localStorage : sessionStorage).setItem(STORAGE_KEY, trimmed);
  } catch {
    /* bleibt im Arbeitsspeicher */
  }
  window.dispatchEvent(new Event(KEY_CHANGED_EVENT));
};

export const clearApiKey = (notify = true) => {
  memoryKey = null;
  safeRemove(sessionStorage);
  safeRemove(localStorage);
  if (notify) window.dispatchEvent(new Event(KEY_CHANGED_EVENT));
};

/**
 * Liefert den Key oder öffnet den Key-Dialog und bricht die Anfrage ab.
 */
export const requireApiKey = (): string => {
  const key = getApiKey();
  if (!key) {
    window.dispatchEvent(new Event(KEY_REQUIRED_EVENT));
    throw new MissingApiKeyError();
  }
  return key;
};

/** Zeigt nur Anfang und Ende des Keys, z. B. "AIza…x9Q2". */
export const maskApiKey = (key: string): string =>
  key.length <= 10 ? '••••' : `${key.slice(0, 4)}…${key.slice(-4)}`;
